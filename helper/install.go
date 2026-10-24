package main

// The helper installs itself. Run it by hand (double click it, or `bookpass-helper install`) and it copies itself
// into a per-user folder and tells each browser where to find it. No administrator rights are needed, and the
// vault is never touched. `uninstall` undoes it.

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

//go:embed ids.json
var idsJSON []byte

// ids are the identities that may start the helper. They are shared with the extension build through ids.json.
type ids struct {
	HostName  string   `json:"hostName"`
	FirefoxID string   `json:"firefoxId"`
	ChromeIDs []string `json:"chromeIds"`
}

func loadIDs() (ids, error) {
	var i ids
	err := json.Unmarshal(idsJSON, &i)
	return i, err
}

// A browser to tell about the helper.
type browserTarget struct {
	Name string
	// Firefox uses allowed_extensions, every other browser allowed_origins.
	Firefox bool
	// Where the manifest goes on macOS and Linux. Only written when the browser's own folder (Root) exists.
	ManifestDir string
	Root        string
	// The registry key on Windows, below HKCU.
	RegKey string
}

func browsers(goos, home string, host string) []browserTarget {
	switch goos {
	case "windows":
		reg := func(vendor string) string { return `Software\` + vendor + `\NativeMessagingHosts\` + host }
		return []browserTarget{
			{Name: "Chrome", RegKey: reg(`Google\Chrome`)},
			{Name: "Edge", RegKey: reg(`Microsoft\Edge`)},
			{Name: "Brave", RegKey: reg(`BraveSoftware\Brave-Browser`)},
			{Name: "Brave Origin", RegKey: reg(`BraveSoftware\Brave-Origin`)},
			{Name: "Vivaldi", RegKey: reg(`Vivaldi`)},
			{Name: "Chromium", RegKey: reg(`Chromium`)},
			{Name: "Firefox", Firefox: true, RegKey: reg(`Mozilla`)},
		}
	case "darwin":
		support := filepath.Join(home, "Library", "Application Support")
		mac := func(name string, firefox bool, dir ...string) browserTarget {
			root := filepath.Join(append([]string{support}, dir...)...)
			return browserTarget{Name: name, Firefox: firefox, Root: root, ManifestDir: filepath.Join(root, "NativeMessagingHosts")}
		}
		return []browserTarget{
			mac("Chrome", false, "Google", "Chrome"),
			mac("Edge", false, "Microsoft Edge"),
			mac("Brave", false, "BraveSoftware", "Brave-Browser"),
			mac("Vivaldi", false, "Vivaldi"),
			mac("Chromium", false, "Chromium"),
			mac("Firefox", true, "Mozilla"),
		}
	default: // linux and the other unixes
		cfg := filepath.Join(home, ".config")
		linux := func(name string, firefox bool, root, dir string) browserTarget {
			return browserTarget{Name: name, Firefox: firefox, Root: root, ManifestDir: dir}
		}
		return []browserTarget{
			linux("Chrome", false, filepath.Join(cfg, "google-chrome"), filepath.Join(cfg, "google-chrome", "NativeMessagingHosts")),
			linux("Chromium", false, filepath.Join(cfg, "chromium"), filepath.Join(cfg, "chromium", "NativeMessagingHosts")),
			linux("Edge", false, filepath.Join(cfg, "microsoft-edge"), filepath.Join(cfg, "microsoft-edge", "NativeMessagingHosts")),
			linux("Brave", false, filepath.Join(cfg, "BraveSoftware", "Brave-Browser"), filepath.Join(cfg, "BraveSoftware", "Brave-Browser", "NativeMessagingHosts")),
			linux("Vivaldi", false, filepath.Join(cfg, "vivaldi"), filepath.Join(cfg, "vivaldi", "NativeMessagingHosts")),
			linux("Firefox", true, filepath.Join(home, ".mozilla"), filepath.Join(home, ".mozilla", "native-messaging-hosts")),
			// Snap and Flatpak browsers run in a sandbox and read their own folders. Whether a sandboxed browser may
			// start a program outside the sandbox is up to the package, so this is best effort.
			linux("Firefox (Snap)", true, filepath.Join(home, "snap", "firefox"), filepath.Join(home, "snap", "firefox", "common", ".mozilla", "native-messaging-hosts")),
			linux("Firefox (Flatpak)", true, filepath.Join(home, ".var", "app", "org.mozilla.firefox"), filepath.Join(home, ".var", "app", "org.mozilla.firefox", ".mozilla", "native-messaging-hosts")),
			linux("Chrome (Flatpak)", false, filepath.Join(home, ".var", "app", "com.google.Chrome"), filepath.Join(home, ".var", "app", "com.google.Chrome", "config", "google-chrome", "NativeMessagingHosts")),
		}
	}
}

// installDir is where the helper program lives once installed.
func installDir(goos, home string) string {
	switch goos {
	case "windows":
		if base := os.Getenv("LOCALAPPDATA"); base != "" {
			return filepath.Join(base, "BookPass")
		}
		return filepath.Join(home, "AppData", "Local", "BookPass")
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "BookPass")
	default:
		if base := os.Getenv("XDG_DATA_HOME"); base != "" {
			return filepath.Join(base, "bookpass")
		}
		return filepath.Join(home, ".local", "share", "bookpass")
	}
}

func exeName(goos string) string {
	if goos == "windows" {
		return "bookpass-helper.exe"
	}
	return "bookpass-helper"
}

// registry is the part of Windows the installer needs, so tests can stand in for it.
type registry interface {
	Set(key, manifestPath string) error
	Delete(key string) error
}

type regExe struct{}

func (regExe) Set(key, manifestPath string) error {
	return exec.Command("reg", "add", `HKCU\`+key, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f").Run()
}

func (regExe) Delete(key string) error {
	return exec.Command("reg", "delete", `HKCU\`+key, "/f").Run()
}

type installer struct {
	goos string
	home string
	reg  registry
	out  io.Writer
}

func (in installer) manifest(b browserTarget, exe string, i ids) ([]byte, error) {
	m := map[string]any{"name": i.HostName, "description": "BookPass native helper", "path": exe, "type": "stdio"}
	if b.Firefox {
		m["allowed_extensions"] = []string{i.FirefoxID}
	} else {
		origins := make([]string, len(i.ChromeIDs))
		for n, id := range i.ChromeIDs {
			origins[n] = "chrome-extension://" + id + "/"
		}
		m["allowed_origins"] = origins
	}
	return json.MarshalIndent(m, "", "  ")
}

// manifestFile is where the manifest for a browser is written.
func (in installer) manifestFile(b browserTarget, dir, host string) string {
	if in.goos == "windows" {
		if b.Firefox {
			return filepath.Join(dir, "host-firefox.json")
		}
		return filepath.Join(dir, "host-chrome.json")
	}
	return filepath.Join(b.ManifestDir, host+".json")
}

// install copies the program at `self` into place and registers it with every browser that is installed.
func (in installer) install(self string) error {
	i, err := loadIDs()
	if err != nil {
		return err
	}
	dir := installDir(in.goos, in.home)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	exe := filepath.Join(dir, exeName(in.goos))
	if !samePath(self, exe) {
		if err := copyProgram(self, exe); err != nil {
			return fmt.Errorf("copying the helper: %w", err)
		}
	}
	fmt.Fprintf(in.out, "Installed the helper to %s\n", exe)

	registered := 0
	for _, b := range browsers(in.goos, in.home, i.HostName) {
		if in.goos != "windows" {
			if _, err := os.Stat(b.Root); err != nil {
				continue // that browser is not installed for this user
			}
		}
		data, err := in.manifest(b, exe, i)
		if err != nil {
			return err
		}
		file := in.manifestFile(b, dir, i.HostName)
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(file, data, 0o644); err != nil {
			return err
		}
		if in.goos == "windows" {
			if err := in.reg.Set(b.RegKey, file); err != nil {
				return fmt.Errorf("registering with %s: %w", b.Name, err)
			}
		}
		fmt.Fprintf(in.out, "Registered with %s\n", b.Name)
		registered++
	}
	if registered == 0 {
		fmt.Fprintln(in.out, "No supported browser was found. Install one, then run this again.")
	}
	return nil
}

// uninstall removes the registrations and the installed program. Your vault and its backups are left alone.
func (in installer) uninstall(self string) error {
	i, err := loadIDs()
	if err != nil {
		return err
	}
	dir := installDir(in.goos, in.home)
	for _, b := range browsers(in.goos, in.home, i.HostName) {
		if in.goos == "windows" {
			_ = in.reg.Delete(b.RegKey) // not registered is fine
		}
		_ = os.Remove(in.manifestFile(b, dir, i.HostName))
	}
	exe := filepath.Join(dir, exeName(in.goos))
	if samePath(self, exe) && in.goos == "windows" {
		// Windows will not delete a program that is running, so leave it and say so.
		fmt.Fprintf(in.out, "Removed the browser registrations. You can delete %s by hand.\n", dir)
		return nil
	}
	for _, name := range []string{exe, exe + ".old", exe + ".new"} {
		if err := os.Remove(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
	}
	_ = os.Remove(dir) // only succeeds when empty
	fmt.Fprintln(in.out, "Removed the helper and its browser registrations. Your vault was not touched.")
	return nil
}

func samePath(a, b string) bool {
	x, errA := filepath.Abs(a)
	y, errB := filepath.Abs(b)
	if errA != nil || errB != nil {
		return false
	}
	if runtime.GOOS == "windows" {
		return strings.EqualFold(x, y)
	}
	return x == y
}

func copyProgram(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	// Renaming over the old program works everywhere except Windows while a browser is running it. There the old
	// one is renamed out of the way first, and removed the next time round.
	if err := os.Rename(tmp, dst); err == nil {
		_ = os.Remove(dst + ".old")
		return nil
	}
	_ = os.Remove(dst + ".old")
	if err := os.Rename(dst, dst+".old"); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dst)
}

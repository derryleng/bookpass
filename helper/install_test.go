package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type fakeRegistry struct{ keys map[string]string }

func (f *fakeRegistry) Set(key, manifestPath string) error {
	f.keys[key] = manifestPath
	return nil
}

func (f *fakeRegistry) Delete(key string) error {
	delete(f.keys, key)
	return nil
}

// A stand in for the helper program that gets installed.
func fakeProgram(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "downloaded-helper")
	if err := os.WriteFile(path, []byte("program bytes"), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func readManifest(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("%s is not json: %v", path, err)
	}
	return m
}

// withChromeID stands in for the development id, which only `-tags dev` builds contain.
func withChromeID(t *testing.T) {
	t.Helper()
	old := devChromeIDs
	devChromeIDs = []string{"abcdefghijklmnopabcdefghijklmnop"}
	t.Cleanup(func() { devChromeIDs = old })
}

func TestInstallOnLinuxWritesManifestsForInstalledBrowsersOnly(t *testing.T) {
	withChromeID(t)
	home := t.TempDir()
	t.Setenv("XDG_DATA_HOME", "")
	// Chrome and Firefox are installed, the rest are not.
	for _, dir := range []string{".config/google-chrome", ".mozilla"} {
		if err := os.MkdirAll(filepath.Join(home, filepath.FromSlash(dir)), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	var out bytes.Buffer
	in := installer{goos: "linux", home: home, out: &out}
	if err := in.install(fakeProgram(t)); err != nil {
		t.Fatal(err)
	}
	exe := filepath.Join(home, ".local", "share", "bookpass", "bookpass-helper")
	if data, err := os.ReadFile(exe); err != nil || string(data) != "program bytes" {
		t.Fatalf("program not copied: %v", err)
	}

	chrome := readManifest(t, filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts", "com.bookpass.helper.json"))
	if chrome["path"] != exe || chrome["type"] != "stdio" {
		t.Fatalf("chrome manifest: %v", chrome)
	}
	if origins, _ := chrome["allowed_origins"].([]any); len(origins) == 0 || !strings.HasPrefix(origins[0].(string), "chrome-extension://") {
		t.Fatalf("chrome origins: %v", chrome["allowed_origins"])
	}
	if _, has := chrome["allowed_extensions"]; has {
		t.Fatal("chrome manifest names firefox extensions")
	}
	firefox := readManifest(t, filepath.Join(home, ".mozilla", "native-messaging-hosts", "com.bookpass.helper.json"))
	if ext, _ := firefox["allowed_extensions"].([]any); len(ext) != 1 || ext[0] != "bookpass@derryleng.github.io" {
		t.Fatalf("firefox extensions: %v", firefox["allowed_extensions"])
	}
	if _, err := os.Stat(filepath.Join(home, ".config", "chromium", "NativeMessagingHosts")); err == nil {
		t.Fatal("wrote a manifest for a browser that is not installed")
	}

	// Installing again is harmless, and uninstalling removes everything it made.
	if err := in.install(exe); err != nil {
		t.Fatalf("second install: %v", err)
	}
	if err := in.uninstall(fakeProgram(t)); err != nil {
		t.Fatal(err)
	}
	for _, gone := range []string{exe, filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts", "com.bookpass.helper.json")} {
		if _, err := os.Stat(gone); err == nil {
			t.Fatalf("%s survived uninstall", gone)
		}
	}
}

func TestInstallOnMacUsesApplicationSupport(t *testing.T) {
	withChromeID(t)
	home := t.TempDir()
	root := filepath.Join(home, "Library", "Application Support", "Google", "Chrome")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	in := installer{goos: "darwin", home: home, out: &bytes.Buffer{}}
	if err := in.install(fakeProgram(t)); err != nil {
		t.Fatal(err)
	}
	m := readManifest(t, filepath.Join(root, "NativeMessagingHosts", "com.bookpass.helper.json"))
	want := filepath.Join(home, "Library", "Application Support", "BookPass", "bookpass-helper")
	if m["path"] != want {
		t.Fatalf("path %v, want %s", m["path"], want)
	}
}

func TestInstallOnWindowsRegistersEveryBrowser(t *testing.T) {
	withChromeID(t)
	home := t.TempDir()
	t.Setenv("LOCALAPPDATA", filepath.Join(home, "Local"))
	reg := &fakeRegistry{keys: map[string]string{}}
	in := installer{goos: "windows", home: home, reg: reg, out: &bytes.Buffer{}}
	if err := in.install(fakeProgram(t)); err != nil {
		t.Fatal(err)
	}
	chrome := reg.keys[`Software\Google\Chrome\NativeMessagingHosts\com.bookpass.helper`]
	firefox := reg.keys[`Software\Mozilla\NativeMessagingHosts\com.bookpass.helper`]
	brave := reg.keys[`Software\BraveSoftware\Brave-Origin\NativeMessagingHosts\com.bookpass.helper`]
	if chrome == "" || firefox == "" || brave == "" || chrome != brave || chrome == firefox {
		t.Fatalf("registry: chrome=%q firefox=%q brave=%q", chrome, firefox, brave)
	}
	if m := readManifest(t, chrome); m["path"] != filepath.Join(home, "Local", "BookPass", "bookpass-helper.exe") {
		t.Fatalf("path: %v", m["path"])
	}
	if err := in.uninstall(fakeProgram(t)); err != nil {
		t.Fatal(err)
	}
	if len(reg.keys) != 0 {
		t.Fatalf("registry keys left: %v", reg.keys)
	}
}

func TestBrowserLaunchArgumentsAreNotCommands(t *testing.T) {
	for _, arg := range []string{"chrome-extension://abcdef/", `C:\Users\me\host.json`, "bookpass@derryleng.github.io", "--parent-window=123"} {
		if !isOriginOrManifest(arg) {
			t.Errorf("%q should be treated as a browser argument", arg)
		}
	}
	if isOriginOrManifest("instal") {
		t.Error("a mistyped command was mistaken for a browser argument")
	}
}

func TestIdsAreComplete(t *testing.T) {
	i, err := loadIDs()
	if err != nil || i.HostName == "" || i.FirefoxID == "" {
		t.Fatalf("ids.json incomplete: %+v %v", i, err)
	}
}

func TestUninstallFromTheInstalledProgramWorksWhereTheSystemAllows(t *testing.T) {
	withChromeID(t)
	home := t.TempDir()
	root := filepath.Join(home, ".config", "google-chrome")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	in := installer{goos: "linux", home: home, out: &bytes.Buffer{}}
	if err := in.install(fakeProgram(t)); err != nil {
		t.Fatal(err)
	}
	exe := filepath.Join(home, ".local", "share", "bookpass", "bookpass-helper")
	// Installing again over the installed program leaves nothing behind.
	if err := in.install(exe); err != nil {
		t.Fatal(err)
	}
	if err := in.install(fakeProgram(t)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(exe + ".old"); err == nil {
		t.Fatal("an old copy was left behind")
	}
	if runtime.GOOS == "windows" {
		t.Skip("Windows cannot delete the program that is running")
	}
	if err := in.uninstall(exe); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Dir(exe)); err == nil {
		t.Fatal("the install folder survived")
	}
}

func TestNoChromeManifestIsWrittenWithoutAnExtensionId(t *testing.T) {
	old := devChromeIDs
	devChromeIDs = nil
	t.Cleanup(func() { devChromeIDs = old })
	i, err := loadIDs()
	if err != nil || len(i.ChromeIDs) != 0 {
		t.Skip("this build knows a Chrome extension id")
	}
	home := t.TempDir()
	for _, dir := range []string{".config/google-chrome", ".mozilla"} {
		if err := os.MkdirAll(filepath.Join(home, filepath.FromSlash(dir)), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	var out bytes.Buffer
	in := installer{goos: "linux", home: home, out: &out}
	if err := in.install(fakeProgram(t)); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts", "com.bookpass.helper.json")); err == nil {
		t.Fatal("wrote a Chrome manifest that names no extension")
	}
	if !strings.Contains(out.String(), "Skipped Chrome") {
		t.Fatalf("the skip was not reported: %q", out.String())
	}
	if _, err := os.Stat(filepath.Join(home, ".mozilla", "native-messaging-hosts", "com.bookpass.helper.json")); err != nil {
		t.Fatalf("Firefox was skipped too: %v", err)
	}
}

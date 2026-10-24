//go:build !windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// chooseFolder uses the folder dialog that ships with the system: AppleScript's on macOS, and zenity or kdialog on
// Linux. They are run with fixed arguments and nothing from the browser, so they cannot be steered to do anything
// else. An empty result means the dialog was closed without a choice.
func chooseFolder() (string, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "darwin" {
		cmd = exec.Command("osascript", "-e", `POSIX path of (choose folder with prompt "`+dialogTitle+`")`)
	} else {
		if os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
			return "", errNoDialog
		}
		if path, err := exec.LookPath("zenity"); err == nil {
			cmd = exec.Command(path, "--file-selection", "--directory", "--title="+dialogTitle)
		} else if path, err := exec.LookPath("kdialog"); err == nil {
			cmd = exec.Command(path, "--getexistingdirectory", ".", "--title", dialogTitle)
		} else {
			return "", errNoDialog
		}
	}
	out, err := cmd.Output()
	var exit *exec.ExitError
	switch {
	case errors.As(err, &exit):
		return "", nil // the dialog was closed
	case errors.Is(err, exec.ErrNotFound):
		return "", errNoDialog
	case err != nil:
		return "", err
	}
	path := strings.TrimSpace(string(out))
	if path == "" {
		return "", nil
	}
	return filepath.Clean(path), nil
}

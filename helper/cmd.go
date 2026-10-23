package main

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
)

const usage = `BookPass helper %s

  bookpass-helper install     copy this program to a per-user folder and register it with your browsers
  bookpass-helper uninstall   undo that (your vault is not touched)
  bookpass-helper version     print the version

Browsers start the helper themselves. You only run it by hand to install or remove it.
`

// runCommand handles the things a person types or double clicks. It reports whether it did anything,
// and if not the program carries on as the browser's native messaging host.
func runCommand(args []string, stdin *os.File, out io.Writer) bool {
	interactive := len(args) == 0 && isTerminal(stdin)
	if !interactive && len(args) == 0 {
		return false
	}
	command := "install"
	if len(args) > 0 {
		command = args[0]
	}
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintln(out, "Cannot find your home folder:", err)
		return true
	}
	self, err := os.Executable()
	if err != nil {
		fmt.Fprintln(out, "Cannot find this program:", err)
		return true
	}
	in := installer{goos: runtime.GOOS, home: home, reg: regExe{}, out: out}
	switch command {
	case "install":
		err = in.install(self)
	case "uninstall":
		err = in.uninstall(self)
	case "version", "--version", "-v":
		fmt.Fprintln(out, helperVersion)
		return true
	case "help", "--help", "-h":
		fmt.Fprintf(out, usage, helperVersion)
		return true
	default:
		// Browsers pass an origin or a manifest path. Anything else typed by hand is a mistake.
		if isOriginOrManifest(args[0]) {
			return false
		}
		fmt.Fprintf(out, "Unknown command %q.\n\n", args[0])
		fmt.Fprintf(out, usage, helperVersion)
		return true
	}
	if err != nil {
		fmt.Fprintln(out, "Failed:", err)
	} else if interactive {
		fmt.Fprintln(out, "\nDone. Open your browser and look for the BookPass button.")
	}
	if interactive {
		// A double clicked console window closes the moment the program ends, so wait to be read.
		fmt.Fprint(out, "Press Enter to close this window.")
		bufio.NewReader(stdin).ReadString('\n')
	}
	return true
}

// isTerminal reports whether stdin is a person at a console rather than a pipe from a browser.
func isTerminal(f *os.File) bool {
	info, err := f.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

// Chrome starts a native host with the calling origin (chrome-extension://...) and Firefox with the manifest path
// and the add-on id. Both are arguments the helper ignores. A word typed by hand has none of these marks.
func isOriginOrManifest(arg string) bool {
	return strings.HasPrefix(arg, "-") || strings.ContainsAny(arg, `/\:@`)
}

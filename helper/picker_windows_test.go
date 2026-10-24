//go:build windows

package main

import (
	"os"
	"syscall"
	"testing"
	"time"
	"unsafe"
)

// The dialog is real, so the test closes it the way a person would with the close button, and expects the helper to
// report that nothing was chosen. That proves the dialog can be created and shown through COM.
func TestChooseFolderOpensAndCancels(t *testing.T) {
	if os.Getenv("BOOKPASS_DIALOG_TEST") == "" {
		t.Skip("opens a real dialog on screen; set BOOKPASS_DIALOG_TEST=1 to run it")
	}
	findWindow := user32.NewProc("FindWindowW")
	postMessage := user32.NewProc("PostMessageW")
	const wmClose = 0x0010
	title, _ := syscall.UTF16PtrFromString(dialogTitle)
	go func() {
		for i := 0; i < 50; i++ {
			time.Sleep(200 * time.Millisecond)
			if hwnd, _, _ := findWindow.Call(0, uintptr(unsafe.Pointer(title))); hwnd != 0 {
				postMessage.Call(hwnd, wmClose, 0, 0)
				return
			}
		}
	}()
	path, err := chooseFolder()
	if err != nil || path != "" {
		t.Fatalf("expected a cancelled dialog, got %q, %v", path, err)
	}
}

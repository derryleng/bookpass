package main

import (
	"errors"
	"os"
	"strings"
)

const dialogTitle = "Where should BookPass keep the vault?"

// errNoDialog means this computer has no way to show a file dialog, for example a server with no screen.
var errNoDialog = errors.New("no file dialog is available")

// pickFolder shows the system's own folder dialog and returns the folder the person chose, or an empty path if
// they closed it.
//
// BOOKPASS_TEST_PICK names a file that stands in for the dialog in tests. Its text is read each time: a path is
// returned as if chosen, "unavailable" as if the computer had no dialog, and nothing as if the dialog was closed.
func (s *server) pickFolder(req *request) *response {
	if file := os.Getenv("BOOKPASS_TEST_PICK"); file != "" {
		data, err := os.ReadFile(file)
		if err != nil {
			return fail(req.ID, codeIO, err.Error())
		}
		answer := strings.TrimSpace(string(data))
		if answer == "unavailable" {
			return fail(req.ID, codeUnavailable, "no file dialog is available on this computer")
		}
		return &response{ID: req.ID, OK: true, Path: answer}
	}
	path, err := chooseFolder()
	if errors.Is(err, errNoDialog) {
		return fail(req.ID, codeUnavailable, "no file dialog is available on this computer")
	}
	if err != nil {
		return fail(req.ID, codeIO, err.Error())
	}
	return &response{ID: req.ID, OK: true, Path: path}
}

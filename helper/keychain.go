package main

import (
	"encoding/base64"
	"errors"
	"fmt"
)

// The unlock key (see src/key-store.ts) can be kept in the operating system's own secret store, so that it is
// protected at rest and can outlive the browser. The helper never writes it to the vault or the config file.
//
//   - Windows: encrypted with the user's data protection key (DPAPI) into a file in the config folder.
//   - macOS: the login keychain, through the `security` program.
//   - Linux: the Secret Service (GNOME Keyring, KWallet), through `secret-tool`, when it is installed.
//
// A computer with none of these answers "unavailable" and the extension keeps the key in browser memory only.
type keyStore interface {
	// Set replaces the stored secret.
	Set(secret string) error
	// Get returns the stored secret, or an empty string if there is none.
	Get() (string, error)
	// Clear removes the stored secret. Having none is not an error.
	Clear() error
}

const (
	keychainService = "com.bookpass.helper"
	keychainAccount = "unlock-key"
	// The key is a base64 hash, or a small JSON object of two of them, so this is generous.
	maxKeyLength = 4096
)

// errNoKeychain means this computer has no secret store the helper can use.
var errNoKeychain = errors.New("no system keychain is available")

func (s *server) keyFail(req *request, err error) *response {
	if errors.Is(err, errNoKeychain) {
		return fail(req.ID, codeUnavailable, err.Error())
	}
	return fail(req.ID, codeIO, err.Error())
}

// The key goes to the secret store as base64, so that quotes and braces in it survive every program in between.
func (s *server) keySet(req *request) *response {
	if req.Key == "" || len(req.Key) > maxKeyLength {
		return fail(req.ID, codeInvalid, fmt.Sprintf("the key must be 1 to %d characters", maxKeyLength))
	}
	if err := s.keys.Set(base64.StdEncoding.EncodeToString([]byte(req.Key))); err != nil {
		return s.keyFail(req, err)
	}
	return &response{ID: req.ID, OK: true}
}

func (s *server) keyGet(req *request) *response {
	stored, err := s.keys.Get()
	if err != nil {
		return s.keyFail(req, err)
	}
	key, err := base64.StdEncoding.DecodeString(stored)
	if err != nil {
		// Something else wrote to that entry. It is of no use to us.
		return &response{ID: req.ID, OK: true}
	}
	return &response{ID: req.ID, OK: true, Key: string(key)}
}

func (s *server) keyClear(req *request) *response {
	if err := s.keys.Clear(); err != nil {
		return s.keyFail(req, err)
	}
	return &response{ID: req.ID, OK: true}
}

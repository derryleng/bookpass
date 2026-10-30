//go:build !windows && !darwin

package main

import (
	"bytes"
	"errors"
	"os/exec"
	"strings"
)

// linuxKeychain talks to the Secret Service with libsecret's `secret-tool`, which reads the secret from standard
// input, so it never appears in the process list.
type linuxKeychain struct{ tool string }

func systemKeys(configDir string) keyStore {
	tool, err := exec.LookPath("secret-tool")
	if err != nil {
		return noKeychain{}
	}
	return linuxKeychain{tool: tool}
}

// noKeychain stands in on a computer without a secret store.
type noKeychain struct{}

func (noKeychain) Set(string) error     { return errNoKeychain }
func (noKeychain) Get() (string, error) { return "", errNoKeychain }
func (noKeychain) Clear() error         { return errNoKeychain }

func (k linuxKeychain) Set(secret string) error {
	cmd := exec.Command(k.tool, "store", "--label=BookPass unlock key", "service", keychainService, "account", keychainAccount)
	cmd.Stdin = strings.NewReader(secret)
	if err := cmd.Run(); err != nil {
		return errors.New("the keyring refused the key (is it unlocked?)")
	}
	return nil
}

func (k linuxKeychain) Get() (string, error) {
	var out bytes.Buffer
	cmd := exec.Command(k.tool, "lookup", "service", keychainService, "account", keychainAccount)
	cmd.Stdout = &out
	// secret-tool exits with 1 and prints nothing when there is no such item, which is also what a locked or
	// missing keyring looks like, so an empty answer is simply "no key".
	_ = cmd.Run()
	return strings.TrimSpace(out.String()), nil
}

func (k linuxKeychain) Clear() error {
	// Clearing an item that is not there is fine, and so is a keyring that is not running.
	_ = exec.Command(k.tool, "clear", "service", keychainService, "account", keychainAccount).Run()
	return nil
}

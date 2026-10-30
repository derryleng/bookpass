package main

import (
	"bytes"
	"errors"
	"os/exec"
	"strings"
)

// notFound is the exit status `security` gives when the keychain has no such item.
const securityNotFound = 44

type macKeychain struct{}

func systemKeys(configDir string) keyStore { return macKeychain{} }

func securityExit(err error) int {
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return exit.ExitCode()
	}
	return -1
}

func (macKeychain) Set(secret string) error {
	// The secret goes in on standard input of the interactive mode, never on the command line, where other
	// programs could read it from the process list.
	cmd := exec.Command("/usr/bin/security", "-i")
	cmd.Stdin = strings.NewReader("add-generic-password -U -s " + keychainService + " -a " + keychainAccount + " -w " + secret + "\n")
	if err := cmd.Run(); err != nil {
		return errors.New("the keychain refused the key")
	}
	// Interactive mode reports a refusal in its output, not in its exit status, so look at what was stored.
	if got, err := (macKeychain{}).Get(); err != nil || got != secret {
		return errors.New("the keychain refused the key")
	}
	return nil
}

func (macKeychain) Get() (string, error) {
	var out bytes.Buffer
	cmd := exec.Command("/usr/bin/security", "find-generic-password", "-s", keychainService, "-a", keychainAccount, "-w")
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		if securityExit(err) == securityNotFound {
			return "", nil
		}
		return "", errors.New("the keychain could not be read")
	}
	return strings.TrimSpace(out.String()), nil
}

func (macKeychain) Clear() error {
	err := exec.Command("/usr/bin/security", "delete-generic-password", "-s", keychainService, "-a", keychainAccount).Run()
	if err != nil && securityExit(err) != securityNotFound {
		return errors.New("the keychain refused to forget the key")
	}
	return nil
}

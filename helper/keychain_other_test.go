//go:build !windows && !darwin

package main

import (
	"os"
	"path/filepath"
	"testing"
)

// A stand in for libsecret's secret-tool that keeps its secret in a file, to check how the helper calls it.
const fakeSecretTool = `#!/bin/sh
store="$(dirname "$0")/secret"
case "$1" in
  store) cat > "$store" ;;
  lookup) [ -f "$store" ] && cat "$store" || exit 1 ;;
  clear) rm -f "$store" ;;
esac
`

func TestSecretToolKeychain(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "secret-tool"), []byte(fakeSecretTool), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", dir+":/usr/bin:/bin")
	keys := systemKeys(t.TempDir())
	if _, ok := keys.(linuxKeychain); !ok {
		t.Fatalf("secret-tool on the path was not used: %T", keys)
	}
	if got, err := keys.Get(); err != nil || got != "" {
		t.Fatalf("empty keychain: %q %v", got, err)
	}
	if err := keys.Set("c2VjcmV0"); err != nil {
		t.Fatal(err)
	}
	if got, err := keys.Get(); err != nil || got != "c2VjcmV0" {
		t.Fatalf("after Set: %q %v", got, err)
	}
	if err := keys.Clear(); err != nil {
		t.Fatal(err)
	}
	if got, _ := keys.Get(); got != "" {
		t.Fatalf("after Clear: %q", got)
	}
}

func TestWithoutSecretToolTheKeychainIsUnavailable(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	if _, ok := systemKeys(t.TempDir()).(noKeychain); !ok {
		t.Fatal("expected no keychain")
	}
}

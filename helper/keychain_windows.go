package main

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"
)

// dpapiKeychain keeps the secret in a file that only this Windows user can decrypt (CryptProtectData). The file is
// useless on another account or another computer, and to anyone who copies it off the disk.
type dpapiKeychain struct{ path string }

func systemKeys(configDir string) keyStore {
	return dpapiKeychain{path: filepath.Join(configDir, "unlock-key.dpapi")}
}

var (
	crypt32       = syscall.NewLazyDLL("crypt32.dll")
	kernel32      = syscall.NewLazyDLL("kernel32.dll")
	procProtect   = crypt32.NewProc("CryptProtectData")
	procUnprotect = crypt32.NewProc("CryptUnprotectData")
	procLocalFree = kernel32.NewProc("LocalFree")
)

// cryptprotectUIForbidden stops Windows from ever showing a prompt from a background program.
const cryptprotectUIForbidden = 0x1

// dataBlob is Windows' DATA_BLOB.
type dataBlob struct {
	size uint32
	data *byte
}

func newBlob(b []byte) *dataBlob {
	if len(b) == 0 {
		return &dataBlob{}
	}
	return &dataBlob{size: uint32(len(b)), data: &b[0]}
}

// entropy ties the encrypted bytes to this program, so another program of the same user has to ask for them by name.
var entropy = []byte(keychainService)

func transform(proc *syscall.LazyProc, in []byte) ([]byte, error) {
	input, extra := newBlob(in), newBlob(entropy)
	var out dataBlob
	// CryptProtectData and CryptUnprotectData take the same arguments in the same order.
	r, _, err := proc.Call(
		uintptr(unsafe.Pointer(input)), 0, uintptr(unsafe.Pointer(extra)), 0, 0,
		cryptprotectUIForbidden, uintptr(unsafe.Pointer(&out)))
	runtime.KeepAlive(in)
	runtime.KeepAlive(entropy)
	if r == 0 {
		return nil, err
	}
	defer procLocalFree.Call(uintptr(unsafe.Pointer(out.data)))
	result := make([]byte, out.size)
	copy(result, unsafe.Slice(out.data, out.size))
	return result, nil
}

func (k dpapiKeychain) Set(secret string) error {
	sealed, err := transform(procProtect, []byte(secret))
	if err != nil {
		return errors.New("Windows could not protect the key")
	}
	if err := os.MkdirAll(filepath.Dir(k.path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(k.path, sealed, 0o600)
}

func (k dpapiKeychain) Get() (string, error) {
	sealed, err := os.ReadFile(k.path)
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	plain, err := transform(procUnprotect, sealed)
	if err != nil {
		return "", nil // written by another user or computer, so it is of no use here
	}
	return string(plain), nil
}

func (k dpapiKeychain) Clear() error {
	if err := os.Remove(k.path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}

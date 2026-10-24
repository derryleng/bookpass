//go:build windows

package main

import (
	"runtime"
	"syscall"
	"unsafe"
)

// The folder dialog is Windows' own IFileOpenDialog, called through COM directly so no other program is started.
var (
	ole32                   = syscall.NewLazyDLL("ole32.dll")
	user32                  = syscall.NewLazyDLL("user32.dll")
	procCoInitializeEx      = ole32.NewProc("CoInitializeEx")
	procCoUninitialize      = ole32.NewProc("CoUninitialize")
	procCoCreateInstance    = ole32.NewProc("CoCreateInstance")
	procCoTaskMemFree       = ole32.NewProc("CoTaskMemFree")
	procGetForegroundWindow = user32.NewProc("GetForegroundWindow")
)

type guid struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

var (
	clsidFileOpenDialog = guid{0xDC1C5A9C, 0xE88A, 0x4DDE, [8]byte{0xA5, 0xA1, 0x60, 0xF8, 0x2A, 0x20, 0xAE, 0xF7}}
	iidFileOpenDialog   = guid{0xD57C7288, 0xD4AD, 0x4768, [8]byte{0xBE, 0x02, 0x9D, 0x96, 0x95, 0x32, 0xD9, 0x60}}
)

const (
	coinitApartmentThreaded = 0x2
	clsctxInprocServer      = 0x1
	fosPickFolders          = 0x20
	fosForceFileSystem      = 0x40
	fosPathMustExist        = 0x800
	sigdnFilesysPath        = 0x80058000
	hresultCancelled        = 0x800704C7
	hresultMask             = 0xFFFFFFFF
)

// comObject is the start of any COM object: a pointer to its table of methods.
type comObject struct{ vtbl *[40]uintptr }

func (o *comObject) call(method int, args ...uintptr) uintptr {
	r, _, _ := syscall.SyscallN(o.vtbl[method], append([]uintptr{uintptr(unsafe.Pointer(o))}, args...)...)
	return r & hresultMask
}

// Positions of the methods used in the tables of the dialog (IFileOpenDialog) and its result (IShellItem).
const (
	methodRelease    = 2
	methodShow       = 3
	methodSetOptions = 9
	methodSetTitle   = 17
	methodGetResult  = 20
	methodGetDisplay = 5
)

func chooseFolder() (string, error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	procCoInitializeEx.Call(0, coinitApartmentThreaded)
	defer procCoUninitialize.Call()

	var dialog *comObject
	hr, _, _ := procCoCreateInstance.Call(
		uintptr(unsafe.Pointer(&clsidFileOpenDialog)), 0, clsctxInprocServer,
		uintptr(unsafe.Pointer(&iidFileOpenDialog)), uintptr(unsafe.Pointer(&dialog)))
	if hr&hresultMask != 0 || dialog == nil {
		return "", errNoDialog
	}
	defer dialog.call(methodRelease)

	dialog.call(methodSetOptions, fosPickFolders|fosForceFileSystem|fosPathMustExist)
	title, _ := syscall.UTF16PtrFromString(dialogTitle)
	dialog.call(methodSetTitle, uintptr(unsafe.Pointer(title)))
	owner, _, _ := procGetForegroundWindow.Call() // so the dialog opens in front of the browser
	if r := dialog.call(methodShow, owner); r != 0 {
		if r == hresultCancelled {
			return "", nil
		}
		return "", syscall.Errno(r & 0xFFFF)
	}
	var item *comObject
	if r := dialog.call(methodGetResult, uintptr(unsafe.Pointer(&item))); r != 0 || item == nil {
		return "", syscall.Errno(r & 0xFFFF)
	}
	defer item.call(methodRelease)
	var name *uint16
	if r := item.call(methodGetDisplay, sigdnFilesysPath, uintptr(unsafe.Pointer(&name))); r != 0 || name == nil {
		return "", syscall.Errno(r & 0xFFFF)
	}
	defer procCoTaskMemFree.Call(uintptr(unsafe.Pointer(name)))
	// The string ends at its first zero.
	length := 0
	for p := unsafe.Pointer(name); *(*uint16)(p) != 0; p = unsafe.Add(p, 2) {
		length++
	}
	return syscall.UTF16ToString(unsafe.Slice(name, length)), nil
}

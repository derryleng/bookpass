//go:build !dev

package main

import "testing"

// The public development extension id must never be allowed by a release helper.
func TestReleaseBuildDoesNotAllowTheDevelopmentExtension(t *testing.T) {
	if len(devChromeIDs) != 0 {
		t.Fatalf("a release build carries development ids: %v", devChromeIDs)
	}
	i, err := loadIDs()
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range i.ChromeIDs {
		if id == "lbcpkmihmlojhhlmdlnfildgcaccbenl" {
			t.Fatal("ids.json lists the development extension id")
		}
	}
}

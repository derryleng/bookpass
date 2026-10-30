//go:build dev

package main

import (
	_ "embed"
	"encoding/json"
)

// The development extension id is public (scripts/ids.ts publishes its key), so any extension built from that key
// would be allowed to start the helper. It is compiled in only with `-tags dev`, which `npm run helper:build` sets.
// Release builds do not use the tag.
//
//go:embed ids.dev.json
var devIDsJSON []byte

func init() {
	var dev struct {
		ChromeIDs []string `json:"chromeIds"`
	}
	if err := json.Unmarshal(devIDsJSON, &dev); err != nil {
		panic("ids.dev.json: " + err.Error())
	}
	devChromeIDs = dev.ChromeIDs
}

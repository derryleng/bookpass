# Raindrop.io parity

BookPass copies the parts of Raindrop.io that make sense for one person with a local, encrypted file. This list was checked against the features Raindrop shows on raindrop.io in October 2026. Anything that needs a server, other people or stored copies of web pages is left out on purpose.

## Built

| Raindrop feature                              | In BookPass                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Collections and nested collections            | Folders and subfolders, with Font Awesome Free icons and colors                                                                                 |
| Four views: grid, headlines, masonry, list    | The same four layouts, chosen per folder, with toggles for covers, notes and tags                                                               |
| Sorting, including manual order               | Date added, date edited, title, website, and manual order by dragging                                                                           |
| Tags, filters, merging tags                   | Tags with autocomplete, a tag manager (rename, merge, color, delete), search with `#tag`, `domain:`, `type:`, `is:fav`, `has:note`, `has:cover` |
| Search                                        | Search across titles, addresses, notes, descriptions and tags, run on the decrypted vault in memory                                             |
| Saving from the browser, with cover and title | Toolbar button, right click menu on pages, links and images, a keyboard shortcut, and saving all or selected tabs                               |
| Favorites                                     | Favorites                                                                                                                                       |
| Batch editing                                 | Select several to move, tag or trash                                                                                                            |
| Duplicate detection                           | Duplicate finder, and imports skip addresses already saved                                                                                      |
| Trash with restore                            | Trash with restore and delete forever                                                                                                           |
| Bookmark history                              | Earlier versions of each bookmark, with restore                                                                                                 |
| Import and export                             | Netscape HTML, Raindrop CSV, the browser's own bookmarks, and export to HTML, CSV and JSON                                                      |
| Backups                                       | Rotating backups kept by the helper, listed and restorable in the settings                                                                      |
| Light and dark themes                         | Match the system, light or dark                                                                                                                 |
| Sync across devices                           | Through a folder that Syncthing, OneDrive, Dropbox or similar syncs. BookPass merges changes from several computers                             |

## Left out

| Raindrop feature                                            | Why                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Web archive and permanent copies                            | Saved pages would make the vault and every backup huge. Possible later as opt-in attachments with a size cap |
| Instant preview and reader view                             | Needs a stored copy of the page, or reading it again from the site                                           |
| Full-text search of page content and PDFs                   | Needs stored page text or a server                                                                           |
| Highlights and annotations                                  | In the backlog, after 1.0                                                                                    |
| Reminders                                                   | In the backlog. Local notifications would only work while the browser runs                                   |
| Broken link check                                           | Contacts every bookmarked site, which needs access to all sites. In the backlog as an optional permission    |
| Sharing, public collections, collaboration                  | One encrypted vault per person. Sharing would mean sharing the password                                      |
| Uploading files and media                                   | Needs storage space BookPass does not have                                                                   |
| Accounts, subscriptions, web app, mobile apps, desktop apps | Nothing to run them on. Firefox for Android is a possible later target                                       |
| Integrations, public API, MCP server, AI assistant          | Would send data to a server                                                                                  |
| Automatic backups to Dropbox or Google Drive                | The vault file can live in a synced folder, which does the same job                                          |
| Other languages                                             | The interface is English only for now                                                                        |
| Safari                                                      | Out of scope                                                                                                 |

// Compile-time profile for DreamHoa's Samsung BU8000. Normal builds keep all features.
export const IS_BU8000_BUILD = process.env.REACT_APP_TV_PROFILE === 'bu8000';
export const BOOKS_ENABLED = !IS_BU8000_BUILD;
export const WATCH_PARTY_ENABLED = !IS_BU8000_BUILD;
export const SEERR_ENABLED = !IS_BU8000_BUILD;

// Apply at the context boundary so a saved/server profile cannot reactivate removed features.
// Do not save these overrides back to the shared server profile.
export const personalSettings = (settings) => IS_BU8000_BUILD ? {
	...settings,
	experimentalTruehd: false,
	syncplayEnabled: false,
	syncplayAutoOpen: false,
	showSyncPlayButton: false,
	watchPartyAlerts: false,
	showSeerrButton: false,
	seerrShowMissingCollectionItems: false,
	showSeerrAvailabilityBadges: false
} : settings;

export const personalLibraries = (libraries) => BOOKS_ENABLED ? libraries : (libraries || []).filter((library) =>
	!['books', 'book', 'comics', 'comic'].includes(String(library.CollectionType || '').toLowerCase()));

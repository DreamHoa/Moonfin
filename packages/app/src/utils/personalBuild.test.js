const original = process.env.REACT_APP_TV_PROFILE;
afterEach(() => {
	if (original === undefined) delete process.env.REACT_APP_TV_PROFILE;
	else process.env.REACT_APP_TV_PROFILE = original;
	jest.resetModules();
});

test('BU8000 removes only requested features, even with a previously enabled server profile', () => {
	process.env.REACT_APP_TV_PROFILE = 'bu8000';
	jest.resetModules();
	const {personalSettings, personalLibraries} = require('./personalBuild');
	const saved = {syncplayEnabled: true, showSeerrButton: true, showLiveTvButton: true,
		featuredTrailerPreview: true, seasonalTheme: 'snow', maxBitrate: 0};
	const actual = personalSettings(saved);
	expect(actual).toMatchObject({...saved, syncplayEnabled: false, showSeerrButton: false});
	expect(saved.syncplayEnabled).toBe(true);
	const libraries = ['movies', 'tvshows', 'books', 'comics', 'music', 'livetv', 'audiobooks'].map((CollectionType) => ({CollectionType}));
	expect(personalLibraries(libraries).map((entry) => entry.CollectionType)).toEqual(['movies', 'tvshows', 'music', 'livetv', 'audiobooks']);
});

test('standard builds retain original settings and library list', () => {
	process.env.REACT_APP_TV_PROFILE = '';
	jest.resetModules();
	const {personalSettings, personalLibraries} = require('./personalBuild');
	const settings = {syncplayEnabled: true};
	const libraries = [{CollectionType: 'books'}];
	expect(personalSettings(settings)).toBe(settings);
	expect(personalLibraries(libraries)).toBe(libraries);
});

test('BU8000 party UI does not import the removed dialog components', () => {
	process.env.REACT_APP_TV_PROFILE = 'bu8000';
	jest.resetModules();
	const ui = require('../components/personalPartyUi');
	expect(ui.WatchPartyDialog()).toBeNull();
	expect(ui.SyncPlayDialog()).toBeNull();
	expect(ui.WatchPartyLayer()).toBeNull();
	expect(ui.useWatchPartyHomeRow({enabled: true, active: true})).toEqual({row: null, alert: null});
});

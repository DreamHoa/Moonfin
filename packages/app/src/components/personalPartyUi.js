// Webpack folds this branch in the personal build, excluding the party dialogs and styles.
const Empty = () => null;
const ui = process.env.REACT_APP_TV_PROFILE === 'bu8000' ? null : {
	dialog: require('./WatchPartyDialog'),
	sync: require('./SyncPlayDialog'),
	layer: require('./WatchPartyDialog/WatchPartyLayer'),
	row: require('./WatchPartyDialog/WatchPartyRow'),
	bar: require('./WatchPartyDialog/WatchPartyQuickBar'),
	people: require('./WatchPartyDialog/PartyPeople')
};

export const WatchPartyDialog = ui ? ui.dialog.default : Empty;
export const SyncPlayDialog = ui ? ui.sync.default : Empty;
export const WatchPartyLayer = ui ? ui.layer.default : Empty;
export const WatchPartyRow = ui ? ui.row.default : Empty;
export const WatchPartyAlert = ui ? ui.row.WatchPartyAlert : Empty;
export const useWatchPartyHomeRow = ui ? ui.row.useWatchPartyHomeRow : () => ({row: null, alert: null});
export const WatchPartyQuickBar = ui ? ui.bar.default : Empty;
export const PartyPanel = ui ? ui.people.PartyPanel : Empty;

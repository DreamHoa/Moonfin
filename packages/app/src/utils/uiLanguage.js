export const BOOT_LOCALE_KEY = 'moonfin_uiLanguage';
export const DEFAULT_UI_LANGUAGE = 'en-US';

export const normalizeUiLanguage = (locale) => {
	if (typeof locale !== 'string') return undefined;
	const language = locale.trim().toLowerCase().split(/[-_]/)[0];
	if (language === 'zh' || language === 'yue') return 'zh';
	if (language === 'en') return DEFAULT_UI_LANGUAGE;
	return undefined;
};

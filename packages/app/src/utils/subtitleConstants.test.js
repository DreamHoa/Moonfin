import {sanitizeSubtitleHtml} from './subtitleConstants';

test('subtitle formatting keeps only attribute-free text tags', () => {
	expect(sanitizeSubtitleHtml('<b>Hello</b>\\N<i>world</i>\n<u>!</u>')).toBe('<b>Hello</b><br/><i>world</i><br/><u>!</u>');
});

test('ordinary subtitle colors survive without permitting other font attributes', () => {
	expect(sanitizeSubtitleHtml('<font color="#00FF00">text</font>')).toBe('<font color="#00FF00">text</font>');
	const node = document.createElement('div');
	node.innerHTML = sanitizeSubtitleHtml('<font color="red" onmouseover="window.subtitleAttack=true">text</font>');
	expect(node.querySelector('[onmouseover]')).toBeNull();
});

test.each([
	'<img src=x onerror="window.subtitleAttack=true">',
	'<svg onload="window.subtitleAttack=true"></svg>',
	'<b onclick="window.subtitleAttack=true">text</b>',
	'<a href="javascript:window.subtitleAttack=true">text</a>'
])('subtitle HTML cannot create executable elements or attributes: %s', (text) => {
	const element = document.createElement('div');
	element.innerHTML = sanitizeSubtitleHtml(text);
	expect(element.querySelector('img,svg,a,[onclick],[onerror],[onload]')).toBeNull();
});

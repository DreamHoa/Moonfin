import {modernCardImageUrl} from './cardArtwork';

jest.mock('../../utils/helpers', () => ({
	getImageUrl: (server, id, type, options) => JSON.stringify({id, type, options}),
	toAbsoluteImageUrl: (url) => url
}));

const movie = {Id: 'movie', Type: 'Movie', ImageTags: {Primary: 'poster', Thumb: 'wide'}};
const artworkOptions = {itemServerUrl: 'http://server', posterWidth: 160};

test('a small resting poster requests its rendered width instead of a height interpreted as width by the image proxy', () => {
	expect(JSON.parse(modernCardImageUrl(movie, false, artworkOptions))).toEqual({id: 'movie', type: 'Primary', options: {tag: 'poster', maxWidth: 160, quality: 80}});
});

test('wide focused artwork retains its own higher resolution', () => {
	expect(JSON.parse(modernCardImageUrl(movie, true, artworkOptions))).toMatchObject({type: 'Thumb', options: {maxWidth: 600}});
});

test('episode series posters use the same bounded size', () => {
	expect(JSON.parse(modernCardImageUrl({Id: 'episode', Type: 'Episode', SeriesId: 'series', SeriesPrimaryImageTag: 'poster'}, false, artworkOptions)))
		.toEqual({id: 'series', type: 'Primary', options: {maxWidth: 160, quality: 80}});
});

test('callers without the TV size preserve their original image request', () => {
	expect(JSON.parse(modernCardImageUrl(movie, false, {itemServerUrl: 'http://server'})).options).toEqual({tag: 'poster', maxHeight: 360, quality: 80});
});

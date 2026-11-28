/**
 * The rooms a table can stand in. Each venue plays in one of these; practice and friendly matches
 * use the one chosen in Settings. The rooms themselves are built in `render/venue`.
 *
 * Every room here is fictional.
 */

export type RoomId =
  | 'pub'
  | 'club'
  | 'social'
  | 'cafe'
  | 'sportshall'
  | 'neva'
  | 'manor'
  | 'exhibition'
  | 'theatre'
  | 'palace'
  | 'arena';

export interface RoomInfo {
  id: RoomId;
  label: string;
  blurb: string;
}

export const ROOMS: RoomInfo[] = [
  { id: 'pub', label: 'Pub', blurb: 'A local with a table by the bar (a different pub each time)' },
  { id: 'club', label: 'Pool club', blurb: 'A row of tables under the lamps' },
  {
    id: 'social',
    label: 'Sports & social club',
    blurb: 'Oak panels, an honours board and the trophy cabinet',
  },
  { id: 'cafe', label: 'Billiard café', blurb: 'Tiles, mirrors and an espresso machine' },
  { id: 'sportshall', label: 'Sports hall', blurb: 'Court lines, bleachers and a second table' },
  { id: 'neva', label: 'Grand billiard hall', blurb: 'Chandeliers, columns and tall windows' },
  { id: 'manor', label: 'Manor house', blurb: 'An invitational in the library of a country house' },
  { id: 'exhibition', label: 'Exhibition centre', blurb: 'Drapes, sponsor boards and two stands' },
  {
    id: 'theatre',
    label: 'Theatre',
    blurb: 'Steep seats close round the table: the one they all want to play in',
  },
  { id: 'palace', label: 'Palace', blurb: 'A Victorian great hall under a glass vault' },
  { id: 'arena', label: 'Arena', blurb: 'A full bowl, screens and the walk-on' },
];

export const isRoomId = (v: unknown): v is RoomId => ROOMS.some((r) => r.id === v);

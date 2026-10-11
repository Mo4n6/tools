// Girih — what each technique is, in words.
// SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
// Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)

import type { TechniqueId } from '../engine/types';

export type Lesson = {
  aka?: string;
  summary: string;
  how: string;
  spot: string;
  /** What Practice asks the player to tap in the pattern step. */
  patternPrompt?: string;
};

export const LESSONS: Record<TechniqueId, Lesson> = {
  'full-house': {
    summary: 'The last empty cell in a row, column or box.',
    how: 'Every row, column and box holds each digit exactly once. When a unit has eight digits placed, its one empty cell must take the ninth.',
    spot: 'Scan for units that are almost full. It is the first thing to check in any position, and the easiest to miss while hunting for something clever.',
  },
  'hidden-single': {
    summary: 'A digit with only one place left in a unit.',
    how: 'Pick a digit and a box, row or column that still needs it. Every placed copy of that digit rules out its own row, column and box. If only one empty cell in the unit survives, the digit goes there, even if that cell could hold other digits too.',
    spot: 'Work one digit at a time. Boxes are the easiest units to scan: follow each placed copy of the digit across its row and down its column, and see which cells of the box are left.',
  },
  'naked-single': {
    summary: 'A cell with only one possible digit.',
    how: 'Look at one empty cell and everything it can see: its row, its column and its box. If eight different digits appear among them, the ninth is the only one the cell can hold.',
    spot: 'Hidden singles are usually quicker to find. Reach for this when they run out, and check cells in crowded rows, columns and boxes, where most digits are already in view.',
  },
  pointing: {
    aka: 'Locked Candidates (type 1)',
    summary: "A box's candidates for a digit all lie on one line, so the rest of that line loses the digit.",
    how: 'Within a box, find a digit whose candidates all sit in one row (or one column). The box has to place that digit somewhere, and wherever it lands it is in that row. So no cell of that row outside the box can hold it.',
    spot: "For each box, look at where each missing digit can go. Two or three candidates lined up in a row or column 'point' along it and clear the rest of the line.",
    patternPrompt: 'Tap the cells in the box that hold the digit.',
  },
  claiming: {
    aka: 'Box/Line Reduction, Locked Candidates (type 2)',
    summary: "A line's candidates for a digit all lie in one box, so the rest of that box loses the digit.",
    how: "The mirror image of Pointing. If a row (or column) can only put a digit in cells inside one box, the row claims that box's copy of the digit. The box's other cells, off the row, can't have it.",
    spot: 'For each row and column, look for a digit whose candidates all fall within one third of the line.',
    patternPrompt: 'Tap the cells in the line that hold the digit.',
  },
  'naked-pair': {
    summary: 'Two cells in a unit with the same two candidates.',
    how: 'If two cells in a unit can each only be 3 or 7, one is 3 and the other is 7. Those two digits are spoken for, so every other cell in the unit loses 3 and 7. If the pair also shares a box, the box loses them too.',
    spot: 'Look for matching two-candidate cells that share a row, column or box.',
    patternPrompt: 'Tap the two cells of the pair.',
  },
  'hidden-pair': {
    summary: 'Two digits that can only go in the same two cells of a unit.',
    how: 'If, in a row, 2 and 9 can each only go in the same two cells, those cells hold 2 and 9 between them. Whatever else is pencilled into them can go.',
    spot: "The pair is hidden among other candidates. Count where each missing digit can go in a unit: two digits with exactly the same two spots are the pair.",
    patternPrompt: 'Tap the two cells the pair is hidden in.',
  },
  'naked-triple': {
    summary: 'Three cells in a unit whose candidates, together, are only three digits.',
    how: 'Three cells whose combined candidates are 1, 4 and 8 must hold exactly those digits. A cell needn\'t have all three: 1/4, 4/8 and 1/8 still make a triple. The rest of the unit loses 1, 4 and 8.',
    spot: 'Look for cells with two or three candidates drawn from the same three digits.',
    patternPrompt: 'Tap the three cells of the triple.',
  },
  'hidden-triple': {
    summary: 'Three digits confined to the same three cells of a unit.',
    how: 'If three digits can only go in three particular cells of a unit, those cells are taken by them. Every other candidate in those three cells can be removed.',
    spot: 'The hardest of the small subsets to see. Map where each missing digit can go in the unit and look for three that fit inside the same three cells.',
    patternPrompt: 'Tap the three cells the triple is hidden in.',
  },
  'x-wing': {
    summary: 'Two rows where a digit fits only in the same two columns (or two columns, same two rows).',
    how: "Say 5 can only go in columns 2 and 7 in row 1, and only in the same two columns in row 6. The four cells make a rectangle. Row 1's 5 takes one of the columns and row 6's takes the other, so both columns get their 5 from these rows. Every other 5 in those columns can go.",
    spot: 'Pick a digit. Find rows (or columns) where it has exactly two candidates, and look for two whose candidates line up.',
    patternPrompt: 'Tap the four corners of the X-Wing.',
  },
  'xy-wing': {
    aka: 'Y-Wing',
    summary: 'A two-candidate pivot and two wings that force a shared digit into one of the wings.',
    how: 'The pivot holds X or Y. One wing it sees holds X or Z, the other Y or Z. If the pivot is X, the first wing is Z; if it is Y, the second wing is Z. One wing is Z either way, so any cell that sees both wings can\'t be Z.',
    spot: 'Look at cells with two candidates. Find one that sees two others, each sharing a different digit with it and the same third digit (Z) with each other.',
    patternPrompt: 'Tap the pivot and both wings.',
  },
  swordfish: {
    summary: 'An X-Wing with three rows and three columns.',
    how: 'If, in three rows, a digit\'s candidates all fall within the same three columns, each row puts its copy in a different one of those columns. The three columns are then supplied by these rows, so the digit goes from the rest of those columns. A row can have just two of the three spots.',
    spot: 'For one digit, list the rows with two or three candidates and look for three whose columns add up to only three.',
    patternPrompt: 'Tap every cell of the Swordfish that holds the digit.',
  },
  'xyz-wing': {
    summary: 'An XY-Wing whose pivot also holds the shared digit.',
    how: 'The pivot holds X, Y and Z; one wing holds X/Z, the other Y/Z. Whatever the pivot is, Z lands in the pivot or one of the wings. So a cell must see all three to lose Z, which in practice means sharing the pivot\'s box and line.',
    spot: 'Start from a three-candidate cell and look for two two-candidate cells it sees that split its digits between them.',
    patternPrompt: 'Tap the pivot and both wings.',
  },
  skyscraper: {
    summary: 'Two parallel strong links on one digit, with one end of each aligned.',
    how: 'A strong link is a unit where a digit has exactly two places: one of them must be it. Take two rows that each have exactly two places for 5. If one end of each sits in the same column (the base), they can\'t both be 5, so at least one of the other ends (the tops) is. Any cell that sees both tops loses 5.',
    spot: 'For one digit, find rows (or columns) with exactly two candidates. Two that share one column but not the other make the tower.',
    patternPrompt: 'Tap the four cells: both bases and both tops.',
  },
  'two-string-kite': {
    summary: 'A row strong link and a column strong link joined inside a box.',
    how: 'A row has a digit in exactly two places, and so does a column. One end of each sits in the same box, so those two can\'t both be the digit. That pushes the digit into one of the far ends, and a cell that sees both far ends loses it.',
    spot: 'Find a row pair and a column pair on the same digit whose ends meet in one box without being the same cell.',
    patternPrompt: 'Tap the four ends of the two strings.',
  },
  'empty-rectangle': {
    summary: "A box whose candidates for a digit form an L or a cross, plus one strong link.",
    how: "If a box's candidates for 9 all lie in one of its rows and one of its columns, the box's 9 is in that row or that column. Now take a strong link on 9 elsewhere with one end in that row. If that end is 9, the box's 9 is pushed into the column; if the other end is 9, it sees the target directly. The target is where the other end's line crosses the box's column, and it loses 9 either way.",
    spot: "Look for a box where a digit avoids a 2x2 block of cells, leaving an L or a cross, then for a strong link that lines up with one arm.",
  },
  'w-wing': {
    summary: 'Two identical two-candidate cells joined by a strong link.',
    how: 'Two cells both hold X/Y and don\'t see each other. Somewhere a unit has X in exactly two places, one seen by each cell. One of those places is X, which stops the cell that sees it from being X, so that cell is Y. At least one of the pair is Y, so cells seeing both lose Y.',
    spot: 'Find matching bivalue cells that are far apart, then a strong link on one of their digits that bridges them.',
    patternPrompt: 'Tap the two bivalue cells and the two ends of the link.',
  },
  'simple-coloring': {
    aka: 'Singles Chains',
    summary: 'Colour a network of strong links in two shades: one shade is true.',
    how: 'Join every pair of cells where a digit is forced into one of two places, and colour along the network, alternating two shades. Exactly one shade is the true digit. If two cells of one shade see each other, that shade is false everywhere (a colour wrap). A cell outside the network that sees both shades loses the digit (a colour trap).',
    spot: 'Pick a digit with many strong links and walk them, alternating colours as you go.',
  },
  'naked-quad': {
    summary: 'Four cells in a unit holding only four digits between them.',
    how: 'The pair and triple idea, one size up: four cells, four digits, so the rest of the unit loses those digits.',
    spot: 'Rare and easy to overlook. Check units with many unsolved cells when nothing smaller works.',
    patternPrompt: 'Tap the four cells of the quad.',
  },
  'hidden-quad': {
    summary: 'Four digits confined to the same four cells of a unit.',
    how: 'If four digits can only go in the same four cells of a unit, those cells hold exactly those digits, and every other candidate in them can go.',
    spot: 'It lives in units with many empty cells, hidden behind long candidate lists.',
    patternPrompt: 'Tap the four cells the quad is hidden in.',
  },
  jellyfish: {
    summary: 'A fish with four rows and four columns.',
    how: 'Four rows whose candidates for a digit all fall within the same four columns supply those columns with their copies, so the digit goes from the rest of the columns.',
    spot: 'The same search as a Swordfish, one size larger. Rare.',
    patternPrompt: 'Tap every cell of the Jellyfish that holds the digit.',
  },
  'finned-x-wing': {
    summary: 'An X-Wing spoiled by an extra candidate, the fin, near one corner.',
    how: 'Two rows would make an X-Wing if one of them didn\'t have an extra candidate or two. If those extras all sit in one box, then either a fin is the digit or the X-Wing holds. Cells the X-Wing would clear that also share the fin\'s box lose the digit in both cases.',
    spot: 'When an X-Wing almost works, check whether the stray candidates all share a box with one corner.',
    patternPrompt: "Tap the X-Wing's cells and its fin.",
  },
  'finned-swordfish': {
    summary: 'A Swordfish with a fin.',
    how: "The finned idea on three rows and three columns: the Swordfish's eliminations, limited to cells that share the fin's box.",
    spot: 'Look for a Swordfish that fails only because of candidates clustered in one box.',
    patternPrompt: "Tap the Swordfish's cells and its fin.",
  },
  'ur-type-1': {
    summary: 'Three corners of a rectangle hold the same pair, so the fourth can\'t.',
    how: 'Four cells at the corners of a rectangle spanning exactly two boxes, all holding only X and Y, could swap X and Y and stay valid: two solutions. A proper sudoku has one. So when three corners are exactly X/Y, the fourth must be something else.',
    spot: 'Look for three matching bivalue cells at the corners of a rectangle across two boxes.',
    patternPrompt: 'Tap the four corners of the rectangle.',
  },
  'ur-type-2': {
    summary: 'Two corners hold the pair; the other two hold the pair plus the same extra digit.',
    how: 'If the extra digit Z were in neither of the other two corners, the rectangle would be the swappable X/Y pattern. So one of them is Z, and any cell that sees both loses Z.',
    spot: 'Find a rectangle across two boxes where two corners are X/Y and the other two are X/Y/Z, side by side.',
    patternPrompt: 'Tap the four corners of the rectangle.',
  },
  'ur-type-4': {
    summary: 'Two corners hold the pair, and one of the pair is forced into the other two.',
    how: 'If, in a unit the two roof cells share, X can only go in those two cells, one of them is X. If the other were Y, the swappable pattern would appear. So neither roof cell can be Y.',
    spot: 'Find a rectangle with two X/Y corners side by side, then check whether X or Y is locked into the other two corners.',
    patternPrompt: 'Tap the four corners of the rectangle.',
  },
  'bug-plus-one': {
    aka: 'Bivalue Universal Grave + 1',
    summary: 'Every unsolved cell has two candidates except one.',
    how: 'A board where every unsolved cell has two candidates and every digit appears exactly twice in every unit has no unique solution. If one cell has a third candidate, that extra one must be true, or the deadly board would form. It is the candidate that appears three times in that cell\'s row, column and box.',
    spot: 'Only near the end. If the board is all pairs except one cell, look there.',
  },
  'x-chain': {
    summary: 'A chain of alternating strong and weak links on one digit.',
    how: 'Start and end with a strong link (one end must be the digit) and alternate with weak links (the two ends can\'t both be). If the first cell isn\'t the digit, the chain forces the last one to be. One end is the digit either way, so cells seeing both lose it. Skyscrapers and kites are short X-Chains.',
    spot: 'Pick a digit, walk its strong links, and hop between them through any shared unit.',
  },
  'xy-chain': {
    summary: 'A chain of two-candidate cells, each one forcing the next.',
    how: 'Start with a cell holding Z/A. If it isn\'t Z, it\'s A; the next cell sees it and holds A/B, so it\'s B; and so on until a cell is forced to Z. Either the first cell or the last is Z, so cells that see both lose Z. An XY-Wing is a three-cell XY-Chain.',
    spot: 'Follow bivalue cells that see each other and share a digit, tracking what each one is forced to.',
  },
  aic: {
    aka: 'Alternating Inference Chain',
    summary: 'Strong and weak links mixed freely across cells and digits.',
    how: 'The general chain. A link can join one digit in two cells (as in an X-Chain) or two digits in one cell (as in an XY-Chain), in any mix. If strong and weak alternate and the chain starts and ends strong, one of its two ends is true. Equal digits at the ends clear cells that see both; different digits in cells that see each other clear each other; two digits in the same cell clear everything else in it.',
    spot: 'When nothing simpler works, grow a chain from strong links, switching digits through bivalue cells.',
  },
  'als-xz': {
    summary: 'Two almost locked sets joined by a shared digit.',
    how: 'An almost locked set (ALS) is N cells in one unit holding N+1 digits; a bivalue cell is the smallest. Take two with a common digit X where every X in one sees every X in the other. X fits in one set at most, so the other locks onto its remaining digits. If the sets also share Z, Z must be in one of them, so cells that see every Z in both lose Z.',
    spot: 'Look for small groups, such as a bivalue cell or two cells with three digits, sharing two digits with another group.',
  },
};

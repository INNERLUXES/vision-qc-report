// What every report says about itself. The tool does arithmetic on the pass and fail results of a vision station and on the labels
// people gave the same parts, both read from tables. It never looks at an image. The numbers are only as good as the labels and
// the sample; the tool does not replace a measurement system analysis or a gauge study, and it is not a certification. No
// standard sets any check of this tool: each one is a best practice of the tool, and the reports and the documents say so.

export const LEVELS = ['info', 'warning', 'error'];

// The kinds of check: about a file (its columns and its rows as a table), about one row, about one part across rows or across the
// two files, and about a measured rate or the size of the sample.
export const KINDS = ['file', 'record', 'part', 'metric'];

export const NOT_A = 'arithmetic on the pass and fail results of a station and the labels of the same parts, read from two tables and never from an image; the numbers are only as good as the labels and the sample, it does not replace a formal measurement system analysis or gauge study, and it is not a certification';

export const NOTICE = 'This report is arithmetic on the labels and the results in the two files. It never looks at an image. The numbers are only as good as the labels and the sample. It does not replace a formal measurement system analysis or gauge study, and it is not a certification.';

// Why a check is a best practice and not a rule.
export const BEST = 'a best practice of this tool; no standard sets it';

// The defaults of the options that set a limit, as the text of the option.
export const DEFAULTS = { maxEscape: '2', maxFalseReject: '5', minRepeatability: '95', minDefects: '30', minGood: '30' };

// The labels of the matrix rows and columns that are not a defect type.
export const GOOD_ROW = '(good part)';
export const NO_TYPE = '(no type)';
export const NOT_NAMED = '(not named)';
export const PASSED = 'passed';

// The limits of the work. A file past a limit is refused; the tool never reads a part of a file and goes on.
export const LIMITS = {
  maxBytes: 128 * 1024 * 1024,
  maxRows: 1200000,
  maxColumns: 40,
  maxCells: 12000000,
  maxCellLength: 20000,
  maxRun: 9999999,
  maxTypes: 200,
  maxThresholds: 100000,
  maxListed: 1000
};

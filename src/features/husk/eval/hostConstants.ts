// Well-known PowerShell values that obfuscators read as data.
//
// These are NOT environmental keying. They are fixed on every Windows host, so
// resolving them needs no analyst input - but 16% of the corpus cannot reach
// its IEX without them, because the dispatch target is spelled out of their
// characters rather than written literally:
//
//   $VerbosePreference.ToString()[1,3]+'X'   "SilentlyContinue"[1,3] -> "ie" + X
//   $env:ComSpec[4,15,25]-join''             -> "Iex"
//   $ShellId[1]+$ShellId[13]+'X'             "Microsoft.PowerShell" -> "ieX"
//   $PSHome[4]+$PSHome[34]+'X'               -> "ieX"
//
// Exact casing and length matter: these are indexed by position. See
// docs/husk-spec.md section 5.

/** Values keyed by lowercased variable name, without the leading '$'. */
export const HOST_CONSTANTS: ReadonlyMap<string, string> = new Map([
  // Automatic variables used for IEX reconstruction.
  ['verbosepreference', 'SilentlyContinue'],
  ['debugpreference', 'SilentlyContinue'],
  ['warningpreference', 'Continue'],
  ['erroractionpreference', 'Continue'],
  ['progresspreference', 'Continue'],
  ['informationpreference', 'SilentlyContinue'],
  ['confirmpreference', 'High'],
  ['whatifpreference', 'False'],
  ['shellid', 'Microsoft.PowerShell'],
  ['pshome', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0'],
  ['psculture', 'en-US'],
  ['psuiculture', 'en-US'],
  ['psedition', 'Desktop'],
  ['ofs', ' '],

  // Environment variables, in the casing Windows reports.
  ['env:comspec', 'C:\\WINDOWS\\system32\\cmd.exe'],
  ['env:windir', 'C:\\WINDOWS'],
  ['env:systemroot', 'C:\\WINDOWS'],
  ['env:systemdrive', 'C:'],
  ['env:programdata', 'C:\\ProgramData'],
  ['env:programfiles', 'C:\\Program Files'],
  ['env:public', 'C:\\Users\\Public'],
  ['env:allusersprofile', 'C:\\ProgramData'],
  ['env:path', 'C:\\WINDOWS\\system32;C:\\WINDOWS;C:\\WINDOWS\\System32\\Wbem'],
  ['env:pathext', '.COM;.EXE;.BAT;.CMD;.VBS;.JS;.WSF;.MSC'],
  ['env:os', 'Windows_NT'],
  ['env:processor_architecture', 'AMD64'],
]);

/**
 * Environment values that vary by host. They are supplied by the analyst in
 * phase 3; until then reading one is a gap, not a guess, because synthesising
 * a value here would silently produce a wrong answer if it feeds a key.
 */
export const HOST_SPECIFIC = new Set([
  'env:computername',
  'env:username',
  'env:userdomain',
  'env:userprofile',
  'env:temp',
  'env:tmp',
  'env:appdata',
  'env:localappdata',
  'env:homepath',
  'env:homedrive',
  'env:logonserver',
  'env:userdnsdomain',
  'pid',
  'psscriptroot',
  'pscommandpath',
]);

/** Literal values that are not environment-dependent at all. */
export const LITERAL_VARIABLES: ReadonlyMap<string, boolean | null> = new Map<
  string,
  boolean | null
>([
  ['true', true],
  ['false', false],
  ['null', null],
]);

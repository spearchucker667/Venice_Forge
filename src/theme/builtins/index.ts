import type { ThemeMode } from '../themeTypes';
import { BUILTIN_AMBER_ARCHIVE } from './amberArchive';
import { BUILTIN_ARCTIC_GLASS } from './arcticGlass';
import { BUILTIN_AURORA_BOREAL } from './auroraBoreal';
import { BUILTIN_BASALT_NOIR } from './basaltNoir';
import { BUILTIN_CATPPUCCIN } from './catppuccin';
import { BUILTIN_CIRCUIT_MINT } from './circuitMint';
import { BUILTIN_COPPER } from './copper';
import { BUILTIN_COTTON_CANDY_CONSOLE } from './cottonCandyConsole';
import { BUILTIN_CYBER_ORCHID } from './cyberOrchid';
import { BUILTIN_DARK } from './dark';
import { BUILTIN_DESERT_COPPERFIELD } from './desertCopperfield';
import { BUILTIN_DRACULA } from './dracula';
import { BUILTIN_DUAL_PERSONA } from './dualPersona';
import { BUILTIN_EMBER_MONASTERY } from './emberMonastery';
import { BUILTIN_GITHUB_LIGHT } from './githubLight';
import { BUILTIN_GLACIAL_INK } from './glacialInk';
import { BUILTIN_GRUVBOX_DARK } from './gruvboxDark';
import { BUILTIN_HARBOR_FOG } from './harborFog';
import { BUILTIN_LIGHT } from './light';
import { BUILTIN_MIDNIGHT_COBALT } from './midnightCobalt';
import { BUILTIN_MIDNIGHT_VELVET } from './midnightVelvet';
import { BUILTIN_MONOKAI } from './monokai';
import { BUILTIN_MOSS_CIRCUIT } from './mossCircuit';
import { BUILTIN_NEON_DUSK } from './neonDusk';
import { BUILTIN_NORD } from './nord';
import { BUILTIN_OBSIDIAN_BLOOM } from './obsidianBloom';
import { BUILTIN_OBSIDIAN_EMBER } from './obsidianEmber';
import { BUILTIN_ONE_DARK } from './oneDark';
import { BUILTIN_POLAROID_BOARD } from './polaroidBoard';
import { BUILTIN_PORCELAIN_DAYBREAK } from './porcelainDaybreak';
import { BUILTIN_PORCELAIN_SKY } from './porcelainSky';
import { BUILTIN_ROSEPINE } from './rosepine';
import { BUILTIN_SAKURA_TERMINAL } from './sakuraTerminal';
import { BUILTIN_SANDSTONE } from './sandstone';
import { BUILTIN_SOLAR_ASH } from './solarAsh';
import { BUILTIN_SOLARIZED } from './solarized';
import { BUILTIN_SWEET_NIGHTMARE } from './sweetNightmare';
import { BUILTIN_SYNTHWAVE_HARBOR } from './synthwaveHarbor';
import { BUILTIN_TERMINAL_FOREST } from './terminalForest';
import { BUILTIN_TOKYO_NIGHT } from './tokyoNight';
import { BUILTIN_TOXIC_LIMEWIRE } from './toxicLimewire';
import { BUILTIN_ULTRAVIOLET_RAIN } from './ultravioletRain';
import { BUILTIN_VENICE } from './venice';

export {
  BUILTIN_AMBER_ARCHIVE,
  BUILTIN_ARCTIC_GLASS,
  BUILTIN_AURORA_BOREAL,
  BUILTIN_BASALT_NOIR,
  BUILTIN_CATPPUCCIN,
  BUILTIN_CIRCUIT_MINT,
  BUILTIN_COPPER,
  BUILTIN_COTTON_CANDY_CONSOLE,
  BUILTIN_CYBER_ORCHID,
  BUILTIN_DARK,
  BUILTIN_DESERT_COPPERFIELD,
  BUILTIN_DRACULA,
  BUILTIN_DUAL_PERSONA,
  BUILTIN_EMBER_MONASTERY,
  BUILTIN_GITHUB_LIGHT,
  BUILTIN_GLACIAL_INK,
  BUILTIN_GRUVBOX_DARK,
  BUILTIN_HARBOR_FOG,
  BUILTIN_LIGHT,
  BUILTIN_MIDNIGHT_COBALT,
  BUILTIN_MIDNIGHT_VELVET,
  BUILTIN_MONOKAI,
  BUILTIN_MOSS_CIRCUIT,
  BUILTIN_NEON_DUSK,
  BUILTIN_NORD,
  BUILTIN_OBSIDIAN_BLOOM,
  BUILTIN_OBSIDIAN_EMBER,
  BUILTIN_ONE_DARK,
  BUILTIN_POLAROID_BOARD,
  BUILTIN_PORCELAIN_DAYBREAK,
  BUILTIN_PORCELAIN_SKY,
  BUILTIN_ROSEPINE,
  BUILTIN_SAKURA_TERMINAL,
  BUILTIN_SANDSTONE,
  BUILTIN_SOLAR_ASH,
  BUILTIN_SOLARIZED,
  BUILTIN_SWEET_NIGHTMARE,
  BUILTIN_SYNTHWAVE_HARBOR,
  BUILTIN_TERMINAL_FOREST,
  BUILTIN_TOKYO_NIGHT,
  BUILTIN_TOXIC_LIMEWIRE,
  BUILTIN_ULTRAVIOLET_RAIN,
  BUILTIN_VENICE,
};

export const BUILTIN_THEME_FAMILIES = [
  BUILTIN_VENICE,
  BUILTIN_DARK,
  BUILTIN_LIGHT,
  BUILTIN_OBSIDIAN_EMBER,
  BUILTIN_MIDNIGHT_COBALT,
  BUILTIN_TERMINAL_FOREST,
  BUILTIN_PORCELAIN_SKY,
  BUILTIN_SANDSTONE,
  BUILTIN_OBSIDIAN_BLOOM,
  BUILTIN_HARBOR_FOG,
  BUILTIN_CIRCUIT_MINT,
  BUILTIN_AMBER_ARCHIVE,
  BUILTIN_NEON_DUSK,
  BUILTIN_AURORA_BOREAL,
  BUILTIN_SAKURA_TERMINAL,
  BUILTIN_BASALT_NOIR,
  BUILTIN_SOLAR_ASH,
  BUILTIN_CYBER_ORCHID,
  BUILTIN_ARCTIC_GLASS,
  BUILTIN_DESERT_COPPERFIELD,
  BUILTIN_TOXIC_LIMEWIRE,
  BUILTIN_MIDNIGHT_VELVET,
  BUILTIN_PORCELAIN_DAYBREAK,
  BUILTIN_SYNTHWAVE_HARBOR,
  BUILTIN_MOSS_CIRCUIT,
  BUILTIN_EMBER_MONASTERY,
  BUILTIN_GLACIAL_INK,
  BUILTIN_ULTRAVIOLET_RAIN,
  BUILTIN_COPPER,
  BUILTIN_DRACULA,
  BUILTIN_GRUVBOX_DARK,
  BUILTIN_ROSEPINE,
  BUILTIN_NORD,
  BUILTIN_TOKYO_NIGHT,
  BUILTIN_CATPPUCCIN,
  BUILTIN_SOLARIZED,
  BUILTIN_ONE_DARK,
  BUILTIN_MONOKAI,
  BUILTIN_GITHUB_LIGHT,
  BUILTIN_COTTON_CANDY_CONSOLE,
  BUILTIN_SWEET_NIGHTMARE,
  BUILTIN_DUAL_PERSONA,
  BUILTIN_POLAROID_BOARD,
];

export const DEFAULT_THEME_FAMILY = BUILTIN_VENICE;

export const BUILTIN_CANONICAL_MODES: Record<string, ThemeMode> = {
  "amber-archive": "light",
  "arctic-glass": "light",
  "aurora-boreal": "dark",
  "basalt-noir": "dark",
  catppuccin: "dark",
  "circuit-mint": "dark",
  copper: "dark",
  "cotton-candy-console": "light",
  "cyber-orchid": "dark",
  dark: "dark",
  "desert-copperfield": "light",
  dracula: "dark",
  "dual-persona": "light",
  "ember-monastery": "dark",
  "github-light": "light",
  "glacial-ink": "dark",
  "gruvbox-dark": "dark",
  "harbor-fog": "light",
  light: "light",
  "midnight-cobalt": "dark",
  "midnight-velvet": "dark",
  monokai: "dark",
  "moss-circuit": "dark",
  "neon-dusk": "dark",
  nord: "dark",
  "obsidian-bloom": "dark",
  "obsidian-ember": "dark",
  "one-dark": "dark",
  "polaroid-board": "light",
  "porcelain-daybreak": "light",
  "porcelain-sky": "light",
  rosepine: "dark",
  "sakura-terminal": "dark",
  sandstone: "light",
  "solar-ash": "light",
  solarized: "dark",
  "sweet-nightmare": "dark",
  "synthwave-harbor": "dark",
  "terminal-forest": "dark",
  "tokyo-night": "dark",
  "toxic-limewire": "dark",
  "ultraviolet-rain": "dark",
  venice: "dark",
};

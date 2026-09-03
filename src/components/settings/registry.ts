/**
 * @fileoverview Settings tab registry — add new tabs here.
 * @module components/settings/registry
 */

import { Archive, Brain, LayoutGrid, MessageSquare, Palette, Sliders, Tags, Wand2 } from 'lucide-react';
import { AIConfigTab } from './tabs/AIConfigTab';
import { PromptsTab } from './tabs/PromptsTab';
import { SamplerTab } from './tabs/SamplerTab';
import { SectionsTab } from './tabs/SectionsTab';
import { StudioTab } from './tabs/StudioTab';
import { StudioGenerationTab } from './tabs/StudioGenerationTab';
import { StudioTagsTab } from './tabs/StudioTagsTab';
import { BackupTab } from './tabs/BackupTab';
import type { SettingsTabModule } from './types';

/**
 * Ordered list of settings tabs.
 * To add a new tab: create `tabs/FooTab.tsx`, then append an entry here.
 */
export const SETTINGS_TABS: SettingsTabModule[] = [
  { id: 'ai', label: 'AI Config', icon: Brain, Component: AIConfigTab },
  { id: 'sampler', label: 'Sampler', icon: Sliders, Component: SamplerTab },
  { id: 'prompts', label: 'Prompts', icon: MessageSquare, Component: PromptsTab },
  { id: 'studio', label: 'Studio', icon: Palette, Component: StudioTab },
  { id: 'studio-generation', label: 'Studio Fields', icon: Wand2, Component: StudioGenerationTab },
  { id: 'sections', label: 'Sections', icon: LayoutGrid, Component: SectionsTab },
  { id: 'tags', label: 'Studio Tags', icon: Tags, Component: StudioTagsTab },
  { id: 'backup', label: 'Backup', icon: Archive, Component: BackupTab },
];

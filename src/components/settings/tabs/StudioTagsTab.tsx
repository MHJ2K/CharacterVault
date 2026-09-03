import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Plus, Trash2 } from 'lucide-react';
import type { SettingsTabProps } from '../types';
import { SettingsCard } from '../components/SettingsCard';
import type { AITagCategory } from '../../../db/characterTypes';
import { TAG_CATEGORIES } from '../../../pages/ai-creation-studio/tags/tagData';

const newCategory = (): AITagCategory => ({
  key: `custom-${Date.now()}`,
  label: 'New group',
  tags: [],
});

export const StudioTagsTab: React.FC<SettingsTabProps> = ({ draft, setDraft }) => {
  const categories = draft.studioTagCategories.length ? draft.studioTagCategories : TAG_CATEGORIES.map((category) => ({ ...category, tags: [...category.tags] }));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const update = (next: AITagCategory[]) => setDraft((previous) => ({ ...previous, studioTagCategories: next }));
  const toggleGroup = (key: string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setAllGroupsCollapsed = (collapsed: boolean) => {
    setExpandedGroups(collapsed ? new Set() : new Set(categories.map((category) => category.key)));
  };

  const moveCategory = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= categories.length) return;
    const next = [...categories];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    update(next);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-fg">AI Studio Tags</h3>
        <p className="mt-1 text-sm text-fg-muted">Customize the global groups and tags used by AI Creation Studio. Changes apply after saving settings.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setAllGroupsCollapsed(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-fg-muted hover:bg-hover"><ChevronsDown className="h-3.5 w-3.5" /> Expand all</button>
          <button type="button" onClick={() => setAllGroupsCollapsed(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-fg-muted hover:bg-hover"><ChevronsUp className="h-3.5 w-3.5" /> Collapse all</button>
        </div>
      </div>
      {categories.map((category, categoryIndex) => (
        <SettingsCard key={category.key}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => toggleGroup(category.key)} className="rounded-lg p-2 text-fg-muted hover:bg-hover" aria-expanded={expandedGroups.has(category.key)} aria-label={`${expandedGroups.has(category.key) ? 'Collapse' : 'Expand'} ${category.label}`}>
              {expandedGroups.has(category.key) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <input
              aria-label={`Group ${categoryIndex + 1} name`}
              value={category.label}
              onChange={(event) => update(categories.map((item, index) => index === categoryIndex ? { ...item, label: event.target.value } : item))}
              className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-fg"
            />
            <button type="button" onClick={() => moveCategory(categoryIndex, -1)} disabled={categoryIndex === 0} className="rounded-lg p-2 text-fg-muted hover:bg-hover disabled:opacity-30" aria-label="Move group up"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => moveCategory(categoryIndex, 1)} disabled={categoryIndex === categories.length - 1} className="rounded-lg p-2 text-fg-muted hover:bg-hover disabled:opacity-30" aria-label="Move group down"><ChevronDown className="h-4 w-4" /></button>
            <button type="button" onClick={() => update(categories.filter((_, index) => index !== categoryIndex))} className="rounded-lg p-2 text-danger hover:bg-danger-soft" aria-label={`Delete ${category.label}`}><Trash2 className="h-4 w-4" /></button>
          </div>
          {expandedGroups.has(category.key) && <div className="mt-3 space-y-2">
            {category.tags.map((tag, tagIndex) => (
              <div key={`${category.key}-${tagIndex}`} className="flex items-center gap-2">
                <input
                  aria-label={`${category.label} tag ${tagIndex + 1}`}
                  value={tag}
                  onChange={(event) => update(categories.map((item, index) => index === categoryIndex ? { ...item, tags: item.tags.map((value, currentIndex) => currentIndex === tagIndex ? event.target.value : value) } : item))}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg"
                />
                <button type="button" onClick={() => update(categories.map((item, index) => index === categoryIndex ? { ...item, tags: item.tags.filter((_, currentIndex) => currentIndex !== tagIndex) } : item))} className="rounded-lg p-2 text-danger hover:bg-danger-soft" aria-label="Delete tag"><Trash2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => { if (tagIndex === 0) return; update(categories.map((item, index) => index === categoryIndex ? { ...item, tags: item.tags.map((value, currentIndex) => currentIndex === tagIndex - 1 ? item.tags[tagIndex] : currentIndex === tagIndex ? item.tags[tagIndex - 1] : value) } : item)); }} disabled={tagIndex === 0} className="rounded-lg p-2 text-fg-muted hover:bg-hover disabled:opacity-30" aria-label="Move tag up"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => { if (tagIndex === category.tags.length - 1) return; update(categories.map((item, index) => index === categoryIndex ? { ...item, tags: item.tags.map((value, currentIndex) => currentIndex === tagIndex ? item.tags[tagIndex + 1] : currentIndex === tagIndex + 1 ? item.tags[tagIndex] : value) } : item)); }} disabled={tagIndex === category.tags.length - 1} className="rounded-lg p-2 text-fg-muted hover:bg-hover disabled:opacity-30" aria-label="Move tag down"><ChevronDown className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => update(categories.map((item, index) => index === categoryIndex ? { ...item, tags: [...item.tags, 'new_tag'] } : item))} className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-xs font-medium text-fg-muted hover:bg-hover"><Plus className="h-3.5 w-3.5" /> Add tag</button>
          </div>}
        </SettingsCard>
      ))}
      <button type="button" onClick={() => update([...categories, newCategory()])} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90"><Plus className="h-4 w-4" /> Add group</button>
    </div>
  );
};

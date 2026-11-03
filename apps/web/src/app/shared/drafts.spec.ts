import { clearDrafts, loadDraft, removeDraft, saveDraft } from './drafts';

describe('form drafts', () => {
  beforeEach(() => localStorage.clear());

  it('saves and loads a draft with its base version', () => {
    saveDraft('dev-1', { firstName: 'Karim' }, 3);
    const d = loadDraft<{ firstName: string }>('dev-1');
    expect(d?.value.firstName).toBe('Karim');
    expect(d?.baseVersion).toBe(3);
  });

  it('removes single drafts and clears all drafts on logout', () => {
    saveDraft('a', 1, null);
    saveDraft('b', 2, null);
    localStorage.setItem('other', 'keep');
    removeDraft('a');
    expect(loadDraft('a')).toBeNull();
    clearDrafts();
    expect(loadDraft('b')).toBeNull();
    expect(localStorage.getItem('other')).toBe('keep');
  });
});

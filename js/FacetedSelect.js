/**
 * FacetedSelect Class
 * Reusable ES6 class to control select toggle actions, search inputs, active options filtering,
 * and keyboard navigation (ArrowUp/Down, Enter, Escape).
 */
export class FacetedSelect {
  constructor(container, trigger, searchInput, optionsList, defaultText) {
    this.container = container;
    this.trigger = trigger;
    this.searchInput = searchInput;
    this.optionsList = optionsList;
    this.defaultText = defaultText;
    
    this.focusedIndex = -1;
    this.initEvents();
  }
  
  initEvents() {
    // Toggle active dropdown state on trigger click
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasActive = this.container.classList.contains('active');
      
      // Close other active dropdowns
      document.querySelectorAll('.custom-select').forEach(sel => {
        if (sel !== this.container) {
          sel.classList.remove('active');
          const trigger = sel.querySelector('.select-trigger');
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
      });
      
      this.container.classList.toggle('active');
      const isActive = this.container.classList.contains('active');
      this.trigger.setAttribute('aria-expanded', isActive ? 'true' : 'false');
      
      if (!wasActive) {
        this.searchInput.value = '';
        this.filterOptions();
        this.searchInput.focus();
        this.resetFocus();
      }
    });

    // Event delegation for option click
    this.optionsList.addEventListener('click', (e) => {
      const li = e.target.closest('.option');
      if (!li || li.classList.contains('no-match')) return;
      
      const isDefault = li.getAttribute('data-default') === 'true';
      const val = isDefault ? null : li.getAttribute('data-value');
      
      const triggerText = this.trigger.querySelector('.trigger-text');
      if (triggerText) triggerText.textContent = isDefault ? this.defaultText : val;
      
      this.close();
      if (this.onSelectCallback) this.onSelectCallback(val);
    });
    
    // Filter dropdown elements on user input (debounced by 150ms to prevent performance thrashing)
    let debounceTimer;
    this.searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.filterOptions();
        this.resetFocus();
      }, 150);
    });
    
    // Handle keyboard accessibility
    this.container.addEventListener('keydown', (e) => {
      if (!this.container.classList.contains('active')) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.moveFocus(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.moveFocus(-1);
          break;
        case 'Enter':
          e.preventDefault();
          this.selectFocused();
          break;
        case 'Escape':
          e.preventDefault();
          this.close();
          this.trigger.focus();
          break;
      }
    });
  }
  
  close() {
    this.container.classList.remove('active');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.resetFocus();
  }
  
  resetFocus() {
    this.focusedIndex = -1;
    this.updateKbdFocusUI();
  }
  
  updateKbdFocusUI() {
    const options = this.getSelectableOptions();
    let focusedEl = null;
    options.forEach((opt, idx) => {
      if (idx === this.focusedIndex) {
        opt.classList.add('kbd-focused');
        focusedEl = opt;
      } else {
        opt.classList.remove('kbd-focused');
      }
    });
    if (focusedEl) {
      focusedEl.scrollIntoView({ block: 'nearest' });
    }
  }
  
  getSelectableOptions() {
    return Array.from(this.optionsList.querySelectorAll('.option')).filter(opt => {
      return opt.style.display !== 'none' && 
             !opt.classList.contains('loading') && 
             !opt.classList.contains('no-match');
    });
  }
  
  moveFocus(dir) {
    const options = this.getSelectableOptions();
    if (options.length === 0) return;
    
    this.focusedIndex += dir;
    if (this.focusedIndex < 0) {
      this.focusedIndex = options.length - 1;
    } else if (this.focusedIndex >= options.length) {
      this.focusedIndex = 0;
    }
    this.updateKbdFocusUI();
  }
  
  selectFocused() {
    const options = this.getSelectableOptions();
    if (this.focusedIndex >= 0 && this.focusedIndex < options.length) {
      options[this.focusedIndex].click();
    }
  }
  
  filterOptions() {
    const filterText = this.searchInput.value.toLowerCase().trim();
    const options = Array.from(this.optionsList.querySelectorAll('.option')).filter(opt =>
      !opt.classList.contains('loading') && !opt.classList.contains('no-match')
    );
    
    // Batch read text contents first
    const visibilityMap = options.map(option => {
      const isDefault = option.textContent.startsWith('All ');
      const text = option.textContent.toLowerCase();
      const matches = isDefault || text.includes(filterText);
      return { option, matches };
    });
    
    let matchesCount = 0;
    // Batch write display styles
    visibilityMap.forEach(({ option, matches }) => {
      if (matches) {
        option.style.display = '';
        matchesCount++;
      } else {
        option.style.display = 'none';
      }
    });
    
    // Clear out-of-date "No Matches" labels
    const existingNoMatch = this.optionsList.querySelector('.option.no-match');
    if (existingNoMatch) existingNoMatch.remove();
    
    if (matchesCount === 1) { // Only the default "All..." matched
      const noMatchLi = document.createElement('li');
      noMatchLi.className = 'option no-match';
      noMatchLi.textContent = 'No matching items';
      this.optionsList.appendChild(noMatchLi);
    }
  }
  
  populate(items, selectedValue, onSelectCallback) {
    this.onSelectCallback = onSelectCallback;
    this.optionsList.innerHTML = '';
    
    const fragment = document.createDocumentFragment();

    // Default option
    const allLi = document.createElement('li');
    allLi.className = `option ${selectedValue === null ? 'selected' : ''}`;
    allLi.setAttribute('role', 'option');
    allLi.setAttribute('aria-selected', selectedValue === null ? 'true' : 'false');
    allLi.setAttribute('data-default', 'true');
    allLi.textContent = this.defaultText;
    fragment.appendChild(allLi);
    
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = `option ${selectedValue === item ? 'selected' : ''}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', selectedValue === item ? 'true' : 'false');
      li.setAttribute('data-value', item);
      li.textContent = item;
      fragment.appendChild(li);
    });

    this.optionsList.appendChild(fragment);
    
    this.trigger.querySelector('.trigger-text').textContent = selectedValue || this.defaultText;
    this.filterOptions();
  }
}

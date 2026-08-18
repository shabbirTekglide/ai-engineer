export function normalizeDays(days) {
  const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  let normalized = [];
  if (Array.isArray(days)) {
    normalized = [...days];
  } else if (typeof days === "string") {
    normalized = days.split(/[,\s/]+/).filter(Boolean);
  }

  return normalized.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
}



export function getStartHour(meetingTime) {
  if (!meetingTime || typeof meetingTime !== 'string') return null;

  // Try to match "HH:MM" followed optionally by "AM/PM" (e.g. "7:30 AM-8:45 AM" or "14:30-15:45")
  const match = meetingTime.trim().match(/^(\d{1,2}):\d{2}\s*(AM|PM)?/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const ampm = match[2] ? match[2].toUpperCase() : null;

  if (ampm === 'PM' && hour < 12) {
    hour += 12;
  } else if (ampm === 'AM' && hour === 12) {
    hour = 0;
  }

  return hour;
}

export function formatDateTime(isoString) {
  const date = new Date(isoString);

  // Format date as "Sep 10"
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });

  // Format time as "10:04 AM"
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return `${formattedDate}, ${formattedTime}`;
}

/**
 * Scopes CSS selectors to a container class to prevent style conflicts
 * Transforms selectors like 'body', 'h1', '.content' to '.notes-container', '.notes-container h1', '.notes-container .content'
 * @param {string} css - Raw CSS string
 * @param {string} containerClass - The container class to scope to (default: 'notes-container')
 * @returns {string} - Scoped CSS string
 */
function scopeCssToContainer(css, containerClass = 'notes-container') {
  if (!css) return '';

  // Process CSS by finding rule blocks and scoping their selectors
  let scopedCss = '';
  let depth = 0;
  let currentRule = '';
  let inSelector = true;
  let inAtRule = false;
  let atRuleContent = '';

  for (let i = 0; i < css.length; i++) {
    const char = css[i];

    // Handle @ rules (like @media, @keyframes)
    if (char === '@' && depth === 0) {
      inAtRule = true;
      atRuleContent = '@';
      continue;
    }

    if (inAtRule) {
      atRuleContent += char;
      if (char === '{') {
        // Start of @rule block - output the @rule header and process contents recursively
        scopedCss += atRuleContent;
        inAtRule = false;
        atRuleContent = '';
        depth++;
        inSelector = true;
        currentRule = '';
        continue;
      }
      continue;
    }

    if (char === '{') {
      depth++;
      if (depth === 1) {
        // This is a selector - scope it
        const selectors = currentRule.split(',').map(s => {
          s = s.trim();
          if (!s) return '';
          // Replace 'body' with the container class, scope everything else
          if (s === 'body' || s === 'html') {
            return `.${containerClass}`;
          }
          // Handle pseudo-selectors on body (body::before, etc.)
          if (s.startsWith('body:') || s.startsWith('body::')) {
            return `.${containerClass}${s.slice(4)}`;
          }
          // Scope all other selectors
          return `.${containerClass} ${s}`;
        }).filter(Boolean).join(', ');

        scopedCss += selectors + ' {';
        currentRule = '';
        inSelector = false;
        continue;
      }
    }

    if (char === '}') {
      depth--;
      if (depth === 0) {
        scopedCss += currentRule + '}';
        currentRule = '';
        inSelector = true;
        continue;
      }
    }

    currentRule += char;
  }

  return scopedCss;
}

/**
 * Extracts body content and styles from a full HTML document
 * Used for rendering Rubitt-branded lecture notes that come as complete HTML documents
 * Scopes all CSS selectors to .notes-container to prevent style conflicts with parent app
 * @param {string} htmlString - Full HTML document string
 * @returns {Object} - Object with bodyContent and scopedStyles
 */
export function extractHtmlContent(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    return { bodyContent: '', styles: '' };
  }

  // Create a temporary DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Extract styles from <style> tags
  const styleTags = doc.querySelectorAll('style');
  let rawStyles = '';
  styleTags.forEach(styleTag => {
    rawStyles += styleTag.textContent || styleTag.innerHTML;
  });

  // Scope CSS selectors to .notes-container to prevent conflicts
  const styles = scopeCssToContainer(rawStyles, 'notes-container');

  // Extract body content
  const body = doc.querySelector('body');
  const bodyContent = body ? body.innerHTML : '';

  // If no body found, try to extract content from container div
  if (!bodyContent) {
    const container = doc.querySelector('.container');
    if (container) {
      return {
        bodyContent: container.innerHTML,
        styles: styles
      };
    }
    // If no container, return the entire HTML as-is (might be just content)
    return {
      bodyContent: htmlString,
      styles: styles
    };
  }

  return { bodyContent, styles };
}
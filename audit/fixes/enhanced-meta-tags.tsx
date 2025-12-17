/**
 * Enhanced Meta Tags Implementation for bolt.diy
 *
 * This file contains the improved meta tags implementation that should replace
 * the current basic meta tags in app/routes/_index.tsx
 *
 * Impact: High - Improved search engine visibility and social sharing
 * Effort: Low - 30 minutes to implement
 */

import type { MetaFunction } from '@remix-run/cloudflare';

// Enhanced meta tags with comprehensive SEO optimization
export const enhancedMeta: MetaFunction = () => {
  const title = 'Bolt.diy - AI-Powered Full-Stack Web Development in the Browser';
  const description = 'Build full-stack web applications directly in your browser with AI assistance. Support for 19+ LLMs, integrated terminal, and instant deployment to Netlify, Vercel, and GitHub Pages.';
  const url = 'https://bolt.diy';
  const image = '/social_preview_index.jpg';

  return [
    // Basic meta tags
    { title },
    { name: 'description', content: description },
    {
      name: 'keywords',
      content: 'AI coding assistant, web development, React, Node.js, full-stack, browser IDE, LLM integration, WebContainer, TypeScript, JavaScript'
    },
    { name: 'author', content: 'bolt.diy team' },
    { name: 'robots', content: 'index, follow' },
    { name: 'language', content: 'en-US' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },

    // Open Graph tags for social media sharing
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:image', content: image },
    { property: 'og:url', content: url },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Bolt.diy' },
    { property: 'og:locale', content: 'en_US' },

    // Twitter Card tags
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:site', content: '@bolt_diy' }, // Update with actual Twitter handle if available
    { name: 'twitter:creator', content: '@bolt_diy' },

    // Additional SEO meta tags
    { name: 'theme-color', content: '#1e293b' }, // Bolt theme color
    { name: 'msapplication-TileColor', content: '#1e293b' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    { name: 'apple-mobile-web-app-title', content: 'Bolt.diy' },

    // Canonical URL to prevent duplicate content issues
    { tagName: 'link', rel: 'canonical', href: url },
  ];
};

/**
 * Usage Instructions:
 *
 * 1. Replace the existing meta export in app/routes/_index.tsx:
 *
 *    // Replace this:
 *    export const meta: MetaFunction = () => {
 *      return [{ title: 'Bolt' }, { name: 'description', content: 'Talk with Bolt, an AI assistant from StackBlitz' }];
 *    };
 *
 *    // With this:
 *    import { enhancedMeta } from '~/audit/fixes/enhanced-meta-tags';
 *    export const meta: MetaFunction = enhancedMeta;
 *
 * 2. Update the social preview image path if needed
 * 3. Add actual Twitter handle if available
 * 4. Test the implementation with social media preview tools
 *
 * Expected Results:
 * - Better click-through rates from search results
 * - Improved social media sharing appearance
 * - Enhanced brand visibility across platforms
 */
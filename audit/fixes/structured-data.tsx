/**
 * Structured Data (JSON-LD) Implementation for bolt.diy
 *
 * This component adds comprehensive structured data to improve search engine
 * understanding and rich snippet eligibility.
 *
 * Impact: High - Rich snippets, knowledge panels, enhanced SERP appearance
 * Effort: Medium - 2-3 hours to implement and test
 */

import { useLocation } from '@remix-run/react';

interface StructuredDataProps {
  /** Override default page title */
  title?: string;
  /** Override default description */
  description?: string;
  /** Additional structured data objects */
  additionalSchemas?: Record<string, any>[];
}

export function StructuredData({
  title,
  description,
  additionalSchemas = []
}: StructuredDataProps) {
  const location = useLocation();
  const currentUrl = `https://bolt.diy${location.pathname}`;

  // Organization schema - defines the company/entity
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "bolt.diy",
    "alternateName": "Bolt DIY",
    "description": "AI-powered full-stack web development platform running entirely in the browser",
    "url": "https://bolt.diy",
    "logo": "https://bolt.diy/logo.svg",
    "image": "https://bolt.diy/social_preview_index.jpg",
    "foundingDate": "2023", // Update with actual founding date
    "founder": {
      "@type": "Person",
      "name": "Cole Medin"
    },
    "sameAs": [
      "https://github.com/stackblitz-labs/bolt.diy",
      "https://thinktank.ottomator.ai",
      "https://www.youtube.com/@ColeMedin"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "technical support",
      "url": "https://github.com/stackblitz-labs/bolt.diy/issues"
    }
  };

  // Software application schema - defines the product
  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Bolt.diy",
    "description": title || "Build full-stack web applications directly in your browser with AI assistance. Supports 19+ LLM providers and instant deployment.",
    "url": "https://bolt.diy",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Web Browser",
    "softwareVersion": "1.0.0", // Update with actual version
    "fileSize": "Web-based", // No download required
    "author": {
      "@type": "Organization",
      "name": "StackBlitz Labs"
    },
    "publisher": {
      "@type": "Organization",
      "name": "StackBlitz Labs"
    },
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "validFrom": "2023-01-01" // Update with actual launch date
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.5", // Update with actual rating
      "ratingCount": "1000", // Update with actual count
      "bestRating": "5",
      "worstRating": "1"
    },
    "featureList": [
      "AI-powered code generation with 19+ LLM providers",
      "WebContainer integration for instant execution",
      "Integrated terminal and development environment",
      "Real-time collaboration features",
      "Multi-platform deployment (Netlify, Vercel, GitHub Pages)",
      "Supabase database integration",
      "Data visualization and analysis tools",
      "Git integration and version control",
      "MCP (Model Context Protocol) support"
    ],
    "applicationSubCategory": "Web Development IDE",
    "screenshot": [
      "https://bolt.diy/social_preview_index.jpg"
    ]
  };

  // WebPage schema - defines the current page
  const webpageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title || "Bolt.diy - AI-Powered Full-Stack Web Development",
    "description": description || "Build full-stack web applications directly in your browser with AI assistance",
    "url": currentUrl,
    "inLanguage": "en-US",
    "isPartOf": {
      "@type": "WebSite",
      "name": "Bolt.diy",
      "url": "https://bolt.diy"
    },
    "about": {
      "@type": "Thing",
      "name": "AI-Powered Web Development",
      "description": "Using artificial intelligence to accelerate and enhance web application development"
    },
    "primaryImageOfPage": {
      "@type": "ImageObject",
      "url": "https://bolt.diy/social_preview_index.jpg"
    },
    "datePublished": "2023-01-01", // Update with actual publish date
    "dateModified": new Date().toISOString().split('T')[0]
  };

  // Breadcrumb schema for navigation
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://bolt.diy"
      }
    ]
  };

  // FAQ schema for common questions
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is bolt.diy?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Bolt.diy is an AI-powered full-stack web development platform that runs entirely in your browser. It allows you to build, test, and deploy web applications using artificial intelligence assistance without installing any software."
        }
      },
      {
        "@type": "Question",
        "name": "How many AI models does bolt.diy support?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Bolt.diy supports 19+ AI providers and models, including OpenAI GPT-4, Anthropic Claude 3.5, Google Gemini, Groq, xAI Grok, DeepSeek, Mistral, Cohere, Together AI, and many others. You can choose the best model for your specific task."
        }
      },
      {
        "@type": "Question",
        "name": "Is bolt.diy free to use?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, bolt.diy is free to use. However, you'll need to provide your own API keys for the AI providers you want to use. The platform itself doesn't require any subscription or payment."
        }
      },
      {
        "@type": "Question",
        "name": "What technologies does bolt.diy support?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Bolt.diy supports modern web development technologies including React, TypeScript, Node.js, and many others. It includes an integrated terminal, package management, and can deploy to platforms like Netlify, Vercel, and GitHub Pages."
        }
      },
      {
        "@type": "Question",
        "name": "Can I collaborate with others on bolt.diy?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, bolt.diy supports real-time collaboration features that allow multiple developers to work together on the same project. You can share project links and collaborate in real-time."
        }
      }
    ]
  };

  // Combine all schemas
  const allSchemas = [
    organizationSchema,
    softwareSchema,
    webpageSchema,
    breadcrumbSchema,
    faqSchema,
    ...additionalSchemas
  ];

  return (
    <>
      {allSchemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema, null, 0) }}
        />
      ))}
    </>
  );
}

/**
 * Usage Instructions:
 *
 * 1. Add to your main layout or page component:
 *
 *    import { StructuredData } from '~/components/StructuredData';
 *
 *    export default function Index() {
 *      return (
 *        <div>
 *          {/* Your page content */}
 *          <StructuredData
 *            title="Custom page title"
 *            description="Custom page description"
 *          />
 *        </div>
 *      );
 *    }
 *
 * 2. For different page types, create specialized components:
 *    - Article pages: Article schema
 *    - Product pages: Product schema
 *    - Documentation: TechArticle schema
 *
 * 3. Test implementation with:
 *    - Google's Rich Results Test: https://search.google.com/test/rich-results
 *    - Schema.org validator: https://validator.schema.org/
 *
 * Expected Results:
 * - Rich snippets in search results
 * - Knowledge panels for the organization
 * - Enhanced click-through rates
 * - Better search engine understanding
 */
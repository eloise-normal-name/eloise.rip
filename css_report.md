# CSS Style Report for index.html

Analyzed 41 unique element signatures.

## Element: `<html>`
### Selector: `html`
```css
height: 100%;
```

---

## Element: `<body>`
### Selector: `body`
```css
font-family: var(--body-font);
  color: var(--text-color);
  background-color: var(--bg-color);
  margin: 0;
  padding: 0;
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
```

---

## Element: `<header class='site-header'>`
### Selector: `.site-header`
```css
background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
  text-align: center;
  box-shadow: 0 4px 20px var(--shadow);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  padding-top: 1rem;
```
### Selector: `.site-header::before`
```css
content: '';
  position: absolute;
  top: -10px;
  left: 0;
  width: 100%;
  height: 110%;
  background: 
    radial-gradient(circle at 15% 85%, rgba(255,255,255,0.9) 2.5px, transparent 2.5px),
    radial-gradient(circle at 85% 15%, rgba(255,255,255,0.7) 2.5px, transparent 2.5px),
    radial-gradient(circle at 45% 35%, rgba(255,255,255,1.0) 2px, transparent 2px),
    radial-gradient(circle at 65% 65%, rgba(255,255,255,0.8) 2px, transparent 2px);
  background-size: 200px 200px, 250px 250px, 160px 160px, 220px 220px;
  animation: snowfall-header 12s linear infinite;
  pointer-events: none;
  z-index: 2;
```
### Selector: `.site-header::after`
```css
content: '';
  position: absolute;
  top: -10px;
  left: 0;
  width: 100%;
  height: 110%;
  background: 
    radial-gradient(circle at 25% 25%, rgba(255,255,255,0.6) 3px, transparent 3px),
    radial-gradient(circle at 75% 75%, rgba(255,255,255,0.8) 3px, transparent 3px),
    radial-gradient(circle at 55% 15%, rgba(255,255,255,0.7) 2px, transparent 2px),
    radial-gradient(circle at 35% 85%, rgba(255,255,255,0.9) 2px, transparent 2px);
  background-size: 240px 240px, 200px 200px, 180px 180px, 260px 260px;
  animation: snowfall-header 22s linear infinite;
  pointer-events: none;
  z-index: 2;
```

---

## Element: `<div class='header-content'>`
### Selector: `}

.header-content`
```css
position: relative;
  z-index: 1;
```

---

## Element: `<h1 class='site-title'>`
### Selector: `.site-title`
```css
font-family: var(--heading-font);
  font-size: 2.5rem;
  font-weight: 600;
  margin: 0;
```
### Selector: `.site-title a`
```css
color: white;
  text-decoration: none;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
  transition: var(--transition-base);
```
### Selector: `.site-title a:hover`
```css
transform: scale(1.05);
  display: inline-block;
```

---

## Element: `<a>`
### Selector: `a`
```css
color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
  transition: var(--transition-base);
```

---

## Element: `<img class='site-logo'>`
### Selector: `.site-logo`
```css
height: 1.2em;
  width: auto;
  vertical-align: bottom;
  margin-right: 0.2em;
  margin-bottom: 0.1em;
```
### Selector: `img`
```css
max-width: 100%;
  border-radius: 12px;
  box-shadow: 0 4px 20px var(--shadow);
  margin: 1rem 0;
```

---

## Element: `<p class='site-subtitle'>`
### Selector: `.site-subtitle`
```css
color: rgba(255, 255, 255, 0.78);
  font-size: .8rem;
  font-weight: 300;
  margin: 0;
  text-shadow: none;
```

---

## Element: `<nav class='main-nav'>`
### Selector: `.main-nav a`
```css
color: white;
  text-decoration: none;
  font-weight: 500;
  font-size: small;
  padding: 0.3rem .4rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  transition: var(--transition-base);
  -webkit-backdrop-filter: blur(5px);
  backdrop-filter: blur(5px);
```
### Selector: `.main-nav a:hover`
```css
background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
```
### Selector: `.main-nav a.active`
```css
background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
```
### Selector: `.main-nav ul`
```css
list-style: none;
  padding: 0;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 1rem 0.4rem;
```
### Selector: `.main-nav li`
```css
margin: 0;
```

---

## Element: `<main class='main-content'>`
### Selector: `.main-content`
```css
max-width: 700px;
  width: 100%;
  margin: auto;
  flex: 1 0 auto;
```

---

## Element: `<h2 class='section-title'>`
### Selector: `.section-title`
```css
font-family: var(--heading-font);
  color: var(--primary-color);
  font-size: 2rem;
  text-align: center;
  margin: 1rem;
```

---

## Element: `<article class='article-summary'>`
### Selector: `.article-summary`
```css
background: var(--card-bg);
  border-radius: var(--card-radius);
  margin: 1rem auto;
  padding: 0 3rem;
  box-shadow: 0 8px 30px var(--shadow);
  border: 2px solid var(--border-color);
  position: relative;
  overflow: hidden;
  transition: var(--transition-base);
```
### Selector: `.article-summary::before`
```css
content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--primary-color), var(--secondary-color), var(--accent-color));
```
### Selector: `.article-summary:hover`
```css
transform: translateY(-5px);
  box-shadow: 0 12px 40px var(--shadow-hover);
```

---

## Element: `<h3 class='article-summary-title'>`
### Selector: `.article-summary-title`
```css
font-family: var(--heading-font);
  color: var(--primary-color);
  font-weight: 600;
  margin: 1em auto;
  text-align: center;
```
### Selector: `.article-summary-title a`
```css
color: inherit;
  text-decoration: none;
  transition: color 0.3s ease;
```
### Selector: `.article-summary-title a:hover`
```css
color: var(--accent-color);
```

---

## Element: `<div class='article-summary-meta'>`
### Selector: `.article-summary-meta`
```css
display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-light);
```
### Selector: `.article-summary-meta span`
```css
display: inline-flex;
  align-items: center;
  background: var(--border-color);
  padding: 0.18rem 0.5rem;
  border-radius: 10px;
  font-weight: 500;
```

---

## Element: `<span class='category'>`
### Selector: `.category`
```css
display: inline-flex;
  align-items: center;
  background: var(--border-color);
  padding: 0.18rem 0.5rem;
  border-radius: 10px;
  font-weight: 500;
```

---

## Element: `<div class='article-summary-media'>`
### Selector: `.article-summary-media picture`
```css
margin: 0;
```
### Selector: `.article-summary-media picture img`
```css
margin: 0;
```
### Selector: `.article-summary-media`
```css
--summary-media-max-height: clamp(220px, 40vw, 320px);
  --summary-media-ratio: 1;
  flex: 0 0 auto;
  height: var(--summary-media-max-height);
  width: calc(var(--summary-media-max-height) * var(--summary-media-ratio));
  max-width: 100%;
  margin: 1rem auto;
  align-self: flex-start;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  aspect-ratio: var(--summary-media-ratio);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
```
### Selector: `.article-summary-media a`
```css
display: block;
  height: 100%;
  width: 100%;
```
### Selector: `.article-summary-media img`
```css
width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: left center;
  display: block;
  margin: 0;
```

---

## Element: `<img>`
### Selector: `img`
```css
max-width: 100%;
  border-radius: 12px;
  box-shadow: 0 4px 20px var(--shadow);
  margin: 1rem 0;
```

---

## Element: `<div class='article-summary-content'>`
### Selector: `.article-summary-content`
```css
font-size: 0.9rem;
```

---

## Element: `<div class='article-summary-tags'>`
### Selector: `.article-summary-tags`
```css
font-size: 0.9rem;
```

---

## Element: `<a class='tag'>`
### Selector: `.tag`
```css
display: inline-block;
  background: linear-gradient(135deg, var(--accent-color), var(--primary-color));
  color: white;
  padding: 0.18rem 0.6rem;
  border-radius: 15px;
  text-decoration: none;
  font-weight: 500;
  margin: 0.25rem 0.25rem 0.25rem 0;
  font-size: 0.9rem;
  line-height: 1;
  transition: var(--transition-base);
```
### Selector: `.tag:hover`
```css
transform: translateY(-2px);
  box-shadow: 0 4px 15px var(--shadow);
```
### Selector: `a`
```css
color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
  transition: var(--transition-base);
```

---

## Element: `<nav class='pagination'>`
### Selector: `.pagination`
```css
display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.85rem 1.5rem;
  margin: 2.5rem auto 1.5rem;
  width: fit-content;
  background: var(--card-bg);
  border: 2px solid var(--border-color);
  border-radius: var(--card-radius);
  box-shadow: 0 10px 24px var(--shadow);
  font-weight: 500;
```
### Selector: `.pagination .page-number`
```css
color: var(--text-light);
  background: rgba(255, 255, 255, 0.6);
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 107, 157, 0.15);
  font-size: 0.9rem;
  letter-spacing: 0.02em;
```
### Selector: `.pagination a`
```css
display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.95rem;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--accent-color), var(--primary-color));
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  transition: var(--transition-base);
  box-shadow: 0 6px 18px var(--shadow);
```
### Selector: `.pagination a:hover`
```css
transform: translateY(-2px);
  box-shadow: 0 10px 24px var(--shadow-hover);
```
### Selector: `.pagination a.prev::before`
```css
content: '←';
  font-size: 0.9rem;
```
### Selector: `.pagination a.next::after`
```css
content: '→';
  font-size: 0.9rem;
```

---

## Element: `<span class='page-number'>`
### Selector: `.pagination .page-number`
```css
color: var(--text-light);
  background: rgba(255, 255, 255, 0.6);
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 107, 157, 0.15);
  font-size: 0.9rem;
  letter-spacing: 0.02em;
```

---

## Element: `<a class='next'>`
### Selector: `.pagination a.next::after`
```css
content: '→';
  font-size: 0.9rem;
```
### Selector: `a`
```css
color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
  transition: var(--transition-base);
```

---

## Element: `<footer class='site-footer'>`
### Selector: `.site-footer`
```css
background: var(--card-bg);
  text-align: center;
  padding: 1rem;
  border-top: 2px solid var(--border-color);
  border-radius: 20px 20px 0 0;
  margin-top: auto;
  flex-shrink: 0;
```

---

## Element: `<div class='footer-content'>`
### Selector: `.footer-content p`
```css
margin: 0.5rem 0;
  color: var(--text-light);
```

---

## Element: `<div class='social-links'>`
### Selector: `.social-links`
```css
display: flex;
  justify-content: center;
  gap: 1.5rem;
  flex-wrap: wrap;
```
### Selector: `.social-links a`
```css
display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-light);
  text-decoration: none;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: 15px;
  background: var(--border-color);
  transition: var(--transition-base);
  font-size: 0.9rem;
```
### Selector: `.social-links a:hover`
```css
color: var(--primary-color);
  background: rgba(255, 107, 157, 0.1);
  transform: translateY(-2px);
```
### Selector: `.social-links svg`
```css
width: 20px;
  height: 20px;
  transition: color 0.3s ease;
```

---


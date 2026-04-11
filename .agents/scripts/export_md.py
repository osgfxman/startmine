#!/usr/bin/env python3
"""
export_md.py - Convert Markdown to beautifully styled HTML
Supports: RTL Arabic, GitHub alerts, tables, code blocks, emojis
Usage: python export_md.py <input.md> [output.html]
"""

import sys
import os
import re
import markdown
import webbrowser
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ─── CSS Styling (matches Antigravity's premium look) ───────────────────────

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Cairo:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
    --bg-primary: #0d1117;
    --bg-secondary: #161b22;
    --bg-tertiary: #1c2333;
    --bg-card: #1c2333;
    --text-primary: #e6edf3;
    --text-secondary: #8b949e;
    --text-muted: #6e7681;
    --border-color: #30363d;
    --border-light: #21262d;
    --accent-blue: #58a6ff;
    --accent-green: #3fb950;
    --accent-yellow: #d29922;
    --accent-red: #f85149;
    --accent-purple: #bc8cff;
    --accent-orange: #f0883e;
    --link-color: #58a6ff;
    --code-bg: #1a1f2e;
    --table-header-bg: #1a2332;
    --table-row-alt: #131923;
    --shadow: 0 4px 24px rgba(0,0,0,0.4);
    --radius: 10px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: 'Cairo', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.8;
    font-size: 16px;
    direction: rtl;
    text-align: right;
    padding: 40px 20px;
    -webkit-font-smoothing: antialiased;
}

.container {
    max-width: 900px;
    margin: 0 auto;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 48px 56px;
    box-shadow: var(--shadow);
}

/* ─── Headings ─── */
h1 {
    font-size: 2em;
    font-weight: 800;
    color: var(--text-primary);
    margin: 0 0 24px 0;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--border-color);
    line-height: 1.3;
}

h2 {
    font-size: 1.5em;
    font-weight: 700;
    color: var(--text-primary);
    margin: 40px 0 16px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border-light);
}

h3 {
    font-size: 1.25em;
    font-weight: 600;
    color: var(--accent-blue);
    margin: 32px 0 12px 0;
}

h4 {
    font-size: 1.1em;
    font-weight: 600;
    color: var(--accent-purple);
    margin: 24px 0 10px 0;
}

/* ─── Paragraphs & Lists ─── */
p {
    margin: 12px 0;
    mso-para-margin-top: 6pt;
    mso-para-margin-bottom: 6pt;
    color: var(--text-primary);
}

ul, ol {
    margin: 12px 0;
    padding-right: 24px;
}

li {
    margin: 6px 0;
    color: var(--text-primary);
}

li::marker {
    color: var(--accent-blue);
}

/* ─── Links ─── */
a {
    color: var(--link-color);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.2s;
}

a:hover {
    border-bottom-color: var(--link-color);
}

/* ─── Code ─── */
code {
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    background: var(--code-bg);
    color: var(--accent-orange);
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 0.88em;
    direction: ltr;
    text-align: left;
    unicode-bidi: embed;
}

pre {
    background: var(--code-bg);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    padding: 20px 24px;
    margin: 16px 0;
    overflow-x: auto;
    direction: ltr;
    text-align: left;
}

pre code {
    background: none;
    padding: 0;
    color: var(--text-primary);
    font-size: 0.9em;
    line-height: 1.6;
}

/* ─── Tables (Word-compatible) ─── */
table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
    border: 1px solid #30363d;
    border-radius: var(--radius);
    overflow: hidden;
    font-size: 0.92em;
}

thead {
    background: var(--table-header-bg);
    background-color: #1a2332;
}

th {
    padding: 8px 12px;
    font-weight: 600;
    color: #58a6ff;
    text-align: right;
    border: 1px solid #30363d;
    white-space: nowrap;
    mso-para-margin: 0;
}

td {
    padding: 6px 12px;
    border: 1px solid #30363d;
    color: var(--text-primary);
    vertical-align: top;
    mso-para-margin: 0;
}

/* Zero paragraph spacing inside table cells - critical for Word */
td p, th p {
    margin: 0;
    padding: 0;
    mso-para-margin: 0;
    mso-para-margin-top: 0;
    mso-para-margin-bottom: 0;
    mso-line-height-rule: exactly;
    line-height: 1.4;
}

td ul, td ol, th ul, th ol {
    margin: 0;
    padding-right: 16px;
}

td li, th li {
    margin: 0;
    line-height: 1.4;
}

tr:nth-child(even) td {
    background: var(--table-row-alt);
    background-color: #131923;
}

tr:last-child td {
    border-bottom: 1px solid #30363d;
}

/* ─── Blockquotes & Alerts ─── */
blockquote {
    margin: 16px 0;
    padding: 16px 20px;
    border-right: 4px solid var(--border-color);
    border-left: none;
    background: var(--bg-tertiary);
    border-radius: 0 var(--radius) var(--radius) 0;
    color: var(--text-secondary);
}

/* GitHub-style Alerts */
.alert-note {
    border-right-color: var(--accent-blue);
    background: rgba(88, 166, 255, 0.08);
}
.alert-note .alert-title { color: var(--accent-blue); }

.alert-tip {
    border-right-color: var(--accent-green);
    background: rgba(63, 185, 80, 0.08);
}
.alert-tip .alert-title { color: var(--accent-green); }

.alert-important {
    border-right-color: var(--accent-purple);
    background: rgba(188, 140, 255, 0.08);
}
.alert-important .alert-title { color: var(--accent-purple); }

.alert-warning {
    border-right-color: var(--accent-yellow);
    background: rgba(210, 153, 34, 0.08);
}
.alert-warning .alert-title { color: var(--accent-yellow); }

.alert-caution {
    border-right-color: var(--accent-red);
    background: rgba(248, 81, 73, 0.08);
}
.alert-caution .alert-title { color: var(--accent-red); }

.alert-title {
    font-weight: 700;
    font-size: 0.95em;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.alert-title::before {
    font-size: 1.1em;
}

.alert-note .alert-title::before { content: "ℹ️"; }
.alert-tip .alert-title::before { content: "💡"; }
.alert-important .alert-title::before { content: "❗"; }
.alert-warning .alert-title::before { content: "⚠️"; }
.alert-caution .alert-title::before { content: "🔴"; }

/* ─── Horizontal Rules ─── */
hr {
    border: none;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border-color), transparent);
    margin: 32px 0;
}

/* ─── Strong & Em ─── */
strong {
    font-weight: 700;
    color: var(--text-primary);
}

em {
    font-style: italic;
    color: var(--text-secondary);
}

/* ─── Checkboxes ─── */
.task-list-item {
    list-style: none;
    margin-right: -20px;
}

/* ─── Print Styles ─── */
@media print {
    body {
        background: white;
        color: #1a1a2e;
        padding: 0;
    }
    .container {
        box-shadow: none;
        border: none;
        padding: 20px;
        max-width: 100%;
    }
    h1, h2, h3, h4, strong { color: #1a1a2e; }
    h3 { color: #2563eb; }
    h4 { color: #7c3aed; }
    th { color: #2563eb; }
    code { background: #f1f5f9; color: #c2410c; }
    pre { background: #f8fafc; border-color: #e2e8f0; }
    pre code { color: #1a1a2e; }
    table { border: 1px solid #cbd5e1; border-collapse: collapse; }
    thead { background: #f1f5f9; }
    th { border: 1px solid #cbd5e1; color: #1e40af; padding: 6px 10px; }
    td { border: 1px solid #cbd5e1; padding: 4px 10px; }
    td p, th p { margin: 0; padding: 0; line-height: 1.3; }
    tr:nth-child(even) td { background: #f8fafc; }
    blockquote { background: #f8fafc; border-right-color: #d1d5db; }
    .alert-note { background: #eff6ff; border-right-color: #3b82f6; }
    .alert-tip { background: #f0fdf4; border-right-color: #22c55e; }
    .alert-important { background: #faf5ff; border-right-color: #a855f7; }
    .alert-warning { background: #fffbeb; border-right-color: #f59e0b; }
    .alert-caution { background: #fef2f2; border-right-color: #ef4444; }
    a { color: #2563eb; }
    hr { background: #e2e8f0; }
    p, li, td { color: #334155; }
    var(--text-secondary) { color: #64748b; }
}

/* ─── Responsive ─── */
@media (max-width: 768px) {
    .container { padding: 24px 20px; }
    h1 { font-size: 1.6em; }
    table { font-size: 0.82em; }
    th, td { padding: 8px 10px; }
}
"""

# ─── Alert Icons ────────────────────────────────────────────────────────────

ALERT_ICONS = {
    'NOTE': 'ℹ️',
    'TIP': '💡',
    'IMPORTANT': '❗',
    'WARNING': '⚠️',
    'CAUTION': '🔴',
}

ALERT_TITLES_AR = {
    'NOTE': 'ملاحظة',
    'TIP': 'نصيحة',
    'IMPORTANT': 'مهم',
    'WARNING': 'تحذير',
    'CAUTION': 'تنبيه خطير',
}


def process_github_alerts(html_content):
    """Convert GitHub-style alerts to styled HTML."""
    for alert_type in ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']:
        pattern = rf'<blockquote>\s*<p>\[!{alert_type}\]\s*<br\s*/?>\s*(.*?)</p>'
        replacement = (
            f'<blockquote class="alert-{alert_type.lower()}">'
            f'<p><span class="alert-title">{ALERT_TITLES_AR[alert_type]}</span><br/>'
            r'\1</p>'
        )
        html_content = re.sub(pattern, replacement, html_content, flags=re.DOTALL | re.IGNORECASE)
        
        # Also handle the format without <br>
        pattern2 = rf'<blockquote>\s*<p>\[!{alert_type}\]</p>\s*<p>(.*?)</p>'
        replacement2 = (
            f'<blockquote class="alert-{alert_type.lower()}">'
            f'<p><span class="alert-title">{ALERT_TITLES_AR[alert_type]}</span></p>'
            r'<p>\1</p>'
        )
        html_content = re.sub(pattern2, replacement2, html_content, flags=re.DOTALL | re.IGNORECASE)
    
    return html_content


def convert_md_to_html(md_path, output_path=None):
    """Convert markdown file to styled HTML."""
    md_path = Path(md_path).resolve()
    
    if not md_path.exists():
        print(f"❌ File not found: {md_path}")
        sys.exit(1)
    
    if output_path is None:
        output_path = md_path.with_suffix('.html')
    else:
        output_path = Path(output_path).resolve()
    
    # Read markdown
    with open(md_path, 'r', encoding='utf-8') as f:
        md_text = f.read()
    
    # Convert with extensions
    extensions = [
        'markdown.extensions.tables',
        'markdown.extensions.fenced_code',
        'markdown.extensions.codehilite',
        'markdown.extensions.toc',
        'markdown.extensions.nl2br',
        'markdown.extensions.sane_lists',
        'markdown.extensions.smarty',
    ]
    
    extension_configs = {
        'markdown.extensions.codehilite': {
            'css_class': 'highlight',
            'guess_lang': False,
        },
    }
    
    html_body = markdown.markdown(
        md_text,
        extensions=extensions,
        extension_configs=extension_configs,
        output_format='html5'
    )
    
    # Process GitHub alerts
    html_body = process_github_alerts(html_body)
    
    # Extract title from first h1
    title_match = re.search(r'<h1[^>]*>(.*?)</h1>', html_body)
    title = re.sub(r'<[^>]+>', '', title_match.group(1)) if title_match else md_path.stem
    
    # Build full HTML
    html = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>{CSS}</style>
</head>
<body>
    <div class="container">
        {html_body}
    </div>
</body>
</html>"""
    
    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"✅ Exported: {output_path}")
    print(f"📄 Size: {os.path.getsize(output_path) / 1024:.1f} KB")
    print(f"🌐 Opening in browser...")
    
    # Open in browser
    webbrowser.open(f'file:///{output_path}')
    
    print()
    print("💡 Tips:")
    print("   • Press Ctrl+P in the browser to save as PDF")
    print("   • Or send the HTML file directly by email")
    print("   • Word can also open HTML files (File → Open)")
    
    return str(output_path)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python export_md.py <input.md> [output.html]")
        print("Example: python export_md.py report.md report.html")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    convert_md_to_html(input_file, output_file)

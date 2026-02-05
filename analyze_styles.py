import re
import os

html_path = r"c:\Users\Admin\eloise.rip\eloise.rip\output\index.html"
css_path = r"c:\Users\Admin\eloise.rip\eloise.rip\themes\cute-theme\static\css\style.css"
report_path = r"c:\Users\Admin\eloise.rip\eloise.rip\css_report.md"

def parse_css(css_content):
    rules = []
    # Remove comments
    css_content = re.sub(r'/\*.*?\*/', '', css_content, flags=re.DOTALL)
    # Find blocks
    for match in re.finditer(r'([^{]+)\{([^}]+)\}', css_content):
        selectors = [s.strip() for s in match.group(1).split(',')]
        body = match.group(2).strip()
        for selector in selectors:
            rules.append({'selector': selector, 'body': body})
    return rules

def get_elements(html_content):
    elements = []
    # Regex to find tags
    tags = re.finditer(r'<([a-zA-Z0-9]+)([^>]*)>', html_content)
    for tag in tags:
        tag_name = tag.group(1)
        attrs = tag.group(2)
        classes = []
        ids = []
        
        class_match = re.search(r'class=["\']([^"\']*)["\']', attrs)
        if class_match:
            classes = class_match.group(1).split()
            
        id_match = re.search(r'id=["\']([^"\']*)["\']', attrs)
        if id_match:
            ids = [id_match.group(1)]
            
        elements.append({'tag': tag_name, 'classes': classes, 'ids': ids})
    return elements

def match_rules(element, rules):
    matched = []
    seen_selectors = set()
    
    for rule in rules:
        sel = rule['selector']
        is_match = False
        
        # Check for tag match (e.g., "body", "h1")
        if sel == element['tag']:
            is_match = True
            
        # Check for class match (e.g., ".site-header")
        for cls in element['classes']:
            # Exact class match or class with pseudo-class
            if re.search(r'\.' + re.escape(cls) + r'(?![a-zA-Z0-9_-])', sel):
                # Simple heuristic: if the selector contains the class, it might apply.
                # This is not a full CSS selector parser, but good enough for reporting.
                is_match = True
                
        # Check for id match
        for i in element['ids']:
            if f'#{i}' in sel:
                is_match = True
                
        if is_match and sel not in seen_selectors:
            matched.append(rule)
            seen_selectors.add(sel)
            
    return matched

try:
    print("Reading HTML...")
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
        
    print("Reading CSS...")
    with open(css_path, 'r', encoding='utf-8') as f:
        css_content = f.read()

    css_rules = parse_css(css_content)
    elements = get_elements(html_content)
    
    # Group by unique element signature
    unique_elements = {}
    for el in elements:
        sig = f"<{el['tag']}"
        if el['ids']:
            sig += f" id='{' '.join(el['ids'])}'"
        if el['classes']:
            sig += f" class='{' '.join(el['classes'])}'"
        sig += ">"
        
        if sig not in unique_elements:
            unique_elements[sig] = el

    print(f"Found {len(unique_elements)} unique elements. Generating report...")

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("# CSS Style Report for index.html\n\n")
        f.write(f"Analyzed {len(unique_elements)} unique element signatures.\n\n")
        
        for sig, el in unique_elements.items():
            matched = match_rules(el, css_rules)
            if matched:
                f.write(f"## Element: `{sig}`\n")
                for rule in matched:
                    f.write(f"### Selector: `{rule['selector']}`\n")
                    f.write("```css\n")
                    f.write(rule['body'])
                    f.write("\n```\n")
                f.write("\n---\n\n")
            
    print(f"Report generated at {report_path}")

except Exception as e:
    print(f"Error: {e}")

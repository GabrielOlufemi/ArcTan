# app/services/agent_service.py
# new agent service file, we based watsonx_client due to issues calling it

"""
Direct tool execution for code auditing.
ULTIMATE FIX: Audits ALL .py files, including empty __init__.py files.
"""

from typing import Dict, Any, List
from datetime import datetime

class AgentService:
    """Service for code auditing using direct tool execution."""
    
    def __init__(self):
        pass
    
    async def run_full_audit(self, project_data: Dict[str, Any]) -> Dict[str, Any]:
        """Run full code audit."""
        try:
            print(f"Running audit on {project_data.get('stats', {}).get('python_files', 0)} files")
            
            # Extract ALL Python files (including empty ones)
            files_to_audit = self._extract_files_for_audit(project_data.get('structure', {}))
            
            print(f"Found {len(files_to_audit)} Python files to audit")
            
            # Audit each file
            all_issues = []
            for file_info in files_to_audit:
                issues = self._audit_file(file_info)
                all_issues.extend(issues)
            
            print(f"Found {len(all_issues)} total issues")
            
            # Add code snippets
            enriched_issues = self._add_snippets(all_issues, project_data)
            
            # Format report
            report = self._format_report(enriched_issues, project_data)
            
            return {
                "status": "completed",
                "agent": "Automated_Tester",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "report": report,
                "issues": enriched_issues,
                "summary": {
                    "total_issues": len(enriched_issues),
                    "files_with_issues": len(set(i['file'] for i in enriched_issues)),
                    "severity_breakdown": self._count_by_severity(enriched_issues)
                },
                "project": {
                    "name": project_data.get("filename"),
                    "files_analyzed": len(files_to_audit)
                }
            }
            
        except Exception as e:
            print(f"Audit failed: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                "status": "failed",
                "agent": "Automated_Tester",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "error": str(e),
                "project": {"name": project_data.get("filename"), "files_analyzed": 0}
            }
    
    def _extract_files_for_audit(self, structure: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract ALL Python files, including empty __init__.py files.
        FIXED: Changed from 'and node.get('content')' to 'and 'content' in node'
        """
        files = []
        
        def traverse(node):
            if node.get('type') == 'file':
                # Check: Is it a .py file AND does it have the 'content' key (within json response)?
                if node.get('name', '').endswith('.py') and 'content' in node:
                    files.append({
                        'path': node.get('path', ''),
                        'name': node.get('name', ''),
                        'content': node.get('content', ''),
                        'lines': node.get('lines', 0)
                    })
            elif node.get('type') == 'dir':
                for child in node.get('children', []):
                    traverse(child)
        
        traverse(structure)
        return files
    
    def _audit_file(self, file_info: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Audit a single file for issues."""
        issues = []
        content = file_info['content']
        
        # Skip empty files (like __init__.py)
        if not content or not content.strip():
            return issues
        
        lines = content.splitlines()
        
        for i, line in enumerate(lines, 1):
            line_stripped = line.strip()
            
            # Bare except with pass
            if 'except:' in line and i < len(lines) and 'pass' in lines[i].strip():
                issues.append({
                    'file': file_info['path'],
                    'line': i,
                    'issue': 'Bare except clause with pass - silences all errors',
                    'line_hint': line_stripped[:50],
                    'severity': 'warning',
                    'type': 'logic'
                })
            
            if 'TODO' in line or 'FIXME' in line:
                issues.append({
                    'file': file_info['path'],
                    'line': i,
                    'issue': 'TODO/FIXME comment found',
                    'line_hint': line_stripped[:50],
                    'severity': 'info',
                    'type': 'maintenance'
                })
            
            # Line length
            if len(line) > 120:
                issues.append({
                    'file': file_info['path'],
                    'line': i,
                    'issue': f'Line too long ({len(line)} characters)',
                    'line_hint': line_stripped[:50],
                    'severity': 'info',
                    'type': 'style'
                })
            
            if 'from' in line and 'import *' in line:
                issues.append({
                    'file': file_info['path'],
                    'line': i,
                    'issue': 'Wildcard import may cause namespace pollution',
                    'line_hint': line_stripped[:50],
                    'severity': 'warning',
                    'type': 'style'
                })
        
        # Syntax check
        try:
            import ast
            ast.parse(content)
        except SyntaxError as e:
            issues.append({
                'file': file_info['path'],
                'line': e.lineno or 0,
                'issue': f'Syntax Error: {e.msg}',
                'line_hint': (e.text[:50] if e.text else ''),
                'severity': 'error',
                'type': 'syntax'
            })
        
        return issues
    
    def _add_snippets(self, issues: List[Dict[str, Any]], project_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Add code snippets to issues."""
        file_map = {}
        
        def flatten(node):
            if node.get('type') == 'file' and 'content' in node:
                file_map[node['path']] = node['content']
            for child in node.get('children', []):
                flatten(child)
        
        flatten(project_data.get('structure', {}))
        
        for issue in issues:
            path = issue.get('file', '')
            line_no = issue.get('line', 0)
            content = file_map.get(path, '')
            
            if content and line_no > 0:
                lines = content.splitlines()
                start = max(0, line_no - 3)
                end = min(len(lines), line_no + 2)
                
                snippet_lines = []
                for i in range(start, end):
                    prefix = "→ " if i == line_no - 1 else "  "
                    snippet_lines.append(f"{prefix}{i+1:4d}| {lines[i]}")
                
                issue['snippet'] = "\n".join(snippet_lines)
        
        return issues
    
    def _count_by_severity(self, issues: List[Dict[str, Any]]) -> Dict[str, int]:
        """Count issues by severity."""
        counts = {'error': 0, 'warning': 0, 'info': 0}
        for issue in issues:
            severity = issue.get('severity', 'info')
            counts[severity] = counts.get(severity, 0) + 1
        return counts
    
    def _format_report(self, issues: List[Dict[str, Any]], project_data: Dict[str, Any]) -> str:
        """Format issues as markdown report."""
        lines = [
            "# Code Audit Report",
            f"\n**Project**: {project_data.get('filename', 'Unknown')}",
            f"**Files Analyzed**: {project_data.get('stats', {}).get('python_files', 0)}",
            f"**Total Issues**: {len(issues)}",
            "\n---\n"
        ]
        
        if not issues:
            lines.append("No issues found!")
            return "\n".join(lines)
        
        by_file = {}
        for issue in issues:
            fp = issue.get('file', 'unknown')
            by_file.setdefault(fp, []).append(issue)
        
        for fp, file_issues in by_file.items():
            lines.append(f"\n## {fp}")
            lines.append(f"\n**{len(file_issues)} issue(s)**\n")
            
            for idx, issue in enumerate(file_issues, 1):
                emoji = {'error': '', 'warning': '', 'info': ''}.get(issue.get('severity', 'info'), 'i')
                lines.append(f"\n### {emoji} Issue #{idx}: {issue.get('issue', 'Unknown')}")
                lines.append(f"- **Line**: {issue.get('line', 'N/A')}")
                lines.append(f"- **Severity**: {issue.get('severity', 'info').upper()}")
                
                if 'snippet' in issue:
                    lines.append("\n**Code**:")
                    lines.append("```python")
                    lines.append(issue['snippet'])
                    lines.append("```\n")
        
        return "\n".join(lines)
    
    async def run_audit_only(self, project_data: Dict[str, Any]) -> Dict[str, Any]:
        """Quick audit."""
        result = await self.run_full_audit(project_data)
        return {
            "status": result["status"],
            "agent": "Code_Auditor",
            "timestamp": result["timestamp"],
            "issues": result.get("issues", []),
            "summary": result.get("summary", {})
        }
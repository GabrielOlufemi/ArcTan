# app/utils/zip_hierarchy.py

from pathlib import Path
import zipfile
import shutil
import uuid
from datetime import datetime
from typing import Dict, Any

from fastapi import UploadFile, HTTPException

EXTRACT_BASE = Path("temp_extracted")
EXTRACT_BASE.mkdir(exist_ok=True)


def should_skip_folder(folder_name: str) -> bool:
    """Check if a folder should be completely skipped"""
    folder_lower = folder_name.lower()
    
    # Hidden folders
    if folder_name.startswith('.'):
        return True
    
    # Exact matches - runtime/build folders
    if folder_name in {'__pycache__', 'node_modules', 'uploads', 'temp_extracted'}:
        return True
    
    # Virtual environment detection
    if 'venv' in folder_lower:
        return True
    if folder_lower in {'env', 'virtualenv'}:
        return True
    if folder_lower.endswith('env'):  
        return True
    
    # IDE folders
    if folder_name in {'.idea', '.vscode', '.vs'}:
        return True
    
    # Version control
    if folder_name in {'.git', '.svn', '.hg'}:
        return True
    
    return False


def get_file_category(filename: str) -> str:
    """Categorize a file"""
    ext = Path(filename).suffix.lower()
    
    # Setup/config files
    if filename in {'requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', 'poetry.lock'}:
        return 'setup'
    
    # Test files
    if filename.lower().startswith('test_') or filename.endswith('_test.py'):
        return 'test'
    
    # By extension
    if ext == '.py':
        return 'source'
    if ext in {'.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf'}:
        return 'config'
    if ext == '.md':
        return 'docs'
    if ext == '.ipynb':
        return 'notebook'
    
    return 'other'


def build_tree(path: Path, base: Path, stats: dict, include_content: bool = False) -> Dict[str, Any]:
    """Build tree recursively, collecting stats"""
    
    if path.is_file():
        size = path.stat().st_size
        category = get_file_category(path.name)
        ext = path.suffix.lower()
        
        # Update stats
        stats['files'] += 1
        stats['bytes'] += size
        stats['categories'][category] = stats['categories'].get(category, 0) + 1
        
        if ext == '.py':
            stats['py'] += 1
            if category == 'test':
                stats['tests'] += 1
        elif ext == '.ipynb':
            stats['notebooks'] += 1
        
        # Build base result
        result = {
            "type": "file",
            "name": path.name,
            "path": str(path.relative_to(base)),
            "size": size,
            "category": category,
        }

        # Read content for Python files if requested
        if include_content and ext == '.py' and size < 1_000_000:  # Skip files > 1MB
            try:
                content = path.read_text(encoding='utf-8')
                result["content"] = content
                result["lines"] = len(content.splitlines())
            except (UnicodeDecodeError, PermissionError):
                result["content"] = None
                result["lines"] = 0
        
        return result
    
    # Childrent directory stuff's a directory
    stats['dirs'] += 1
    children = []
    
    try:
        for item in sorted(path.iterdir()):
            # Skip folders we don't want
            if item.is_dir() and should_skip_folder(item.name):
                continue
            
            # Skip hidden files
            if item.name.startswith('.'):
                continue
            
            # Recursively build tree for children
            children.append(build_tree(item, base, stats, include_content))
    except PermissionError:
        pass
    
    return {
        "type": "dir",
        "name": path.name,
        "path": str(path.relative_to(base)) if path != base else "",
        "children": children,
    }


async def process_zip_to_hierarchy(file: UploadFile, include_content: bool = False) -> Dict[str, Any]:
    """Process uploaded ZIP file"""
    
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Only .zip files allowed")

    job_id = str(uuid.uuid4())[:12]
    job_folder = EXTRACT_BASE / job_id
    job_folder.mkdir(exist_ok=True)
    zip_path = job_folder / file.filename

    try:
        # Extract ZIP
        content = await file.read()
        zip_path.write_bytes(content)
        
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(job_folder)
        
        zip_path.unlink()

        # Find project root - unwrap if single top-level folder
        items = [i for i in job_folder.iterdir() if not i.name.startswith('.')]
        root = items[0] if len(items) == 1 and items[0].is_dir() else job_folder

        # Check for common project files
        has_req = (root / 'requirements.txt').exists()
        has_setup = (root / 'setup.py').exists() or (root / 'pyproject.toml').exists()
        has_tests = any((root / t).exists() for t in ['tests', 'test'])
        
        deps = []
        if has_req:
            deps.append('requirements.txt')
        if (root / 'setup.py').exists():
            deps.append('setup.py')
        if (root / 'pyproject.toml').exists():
            deps.append('pyproject.toml')

        # Build tree and collect stats in one pass
        stats = {
            'files': 0,
            'dirs': 0,
            'py': 0,
            'tests': 0,
            'notebooks': 0,
            'bytes': 0,
            'categories': {}
        }
        
        # Pass include_content to build_tree
        tree = build_tree(root, root, stats, include_content)
        
        # Determine complexity
        complexity = "simple"
        if stats['py'] > 20:
            complexity = "moderate"
        if stats['py'] > 50:
            complexity = "complex"

        return {
            "job_id": job_id,
            "filename": file.filename,
            "processed_at": datetime.utcnow().isoformat() + "Z",
            "root": root.name,
            "project": {
                "has_dependencies": has_req or has_setup,
                "dependency_files": deps,
                "has_tests": has_tests,
            },
            "structure": tree,
            "stats": {
                "total_files": stats['files'],
                "total_dirs": stats['dirs'],
                "python_files": stats['py'],
                "test_files": stats['tests'],
                "notebooks": stats['notebooks'],
                "size_mb": round(stats['bytes'] / (1024 * 1024), 2),
                "categories": stats['categories'],
            },
            "summary": {
                "complexity": complexity,
                "code_files": stats['py'],
                "test_files": stats['tests'],
                "has_notebooks": stats['notebooks'] > 0,
                "ready_to_run": has_req or has_setup,
            }
        }

    except zipfile.BadZipFile:
        shutil.rmtree(job_folder, ignore_errors=True)
        raise HTTPException(400, "Invalid ZIP file")
    
    except Exception as e:
        shutil.rmtree(job_folder, ignore_errors=True)
        raise HTTPException(500, f"Failed: {str(e)}")
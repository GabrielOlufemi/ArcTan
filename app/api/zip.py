# app/api/zip.py
# zip.py breakdown api

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from app.utils.zip_hierarchy import process_zip_to_hierarchy
from app.services.agent_service import AgentService

router = APIRouter(prefix="/zip", tags=["zip"])


@router.post("/hierarchy")
async def get_hierarchy(
    file: UploadFile = File(...),
    include_content: bool = True
):
    """
    Get project hierarchy.
    
    - include_content=False: Fast, structure only
    - include_content=True: Includes file contents (needed for analysis)
    """
    result = await process_zip_to_hierarchy(file, include_content)
    return result


@router.post("/analyze")
async def analyze_project(file: UploadFile = File(...)):
    """
    Complete project analysis - returns hierarchy + audit results.
    
    This is the main endpoint your frontend should use.
    Returns everything needed for the project details page.
    """
    try:
        # Step 1: Extract hierarchy with content
        print(f"Processing ZIP: {file.filename}")
        project_data = await process_zip_to_hierarchy(file, include_content=True)
        
        print(f"Extracted {project_data['stats']['python_files']} Python files")
        
        # Step 2: Run code audit
        agent_service = AgentService()
        print("Running code audit...")
        audit_result = await agent_service.run_full_audit(project_data)
        
        print(f"Audit complete: {audit_result.get('status')}")
        
        # Return merged response for frontend
        return {
            "job_id": project_data["job_id"],
            "filename": project_data["filename"],
            "processed_at": project_data["processed_at"],
            "root": project_data["root"],
            
            # Project metadata
            "project": project_data["project"],
            "stats": project_data["stats"],
            "summary": project_data["summary"],
            "structure": project_data["structure"],
            
            # Audit results with issues and code snippets
            "audit": {
                "status": audit_result["status"],
                "timestamp": audit_result["timestamp"],
                "report": audit_result.get("report", ""),
                "issues": audit_result.get("issues", []),  # Already has snippets!
                "summary": audit_result.get("summary", {}),
                "files_analyzed": audit_result.get("project", {}).get("files_analyzed", 0)
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}"
        )


@router.post("/audit")
async def audit_code(file: UploadFile = File(...)):
    """
    Full code audit - legacy endpoint (keep for backwards compatibility).
    Use /analyze instead for combined response.
    """
    try:
        project_data = await process_zip_to_hierarchy(file, include_content=True)
        agent_service = AgentService()
        audit_result = await agent_service.run_full_audit(project_data)
        
        return {
            "job_id": project_data["job_id"],
            "project": {
                "name": project_data["filename"],
                "root": project_data["root"],
                "stats": project_data["stats"],
                "summary": project_data["summary"]
            },
            "audit": audit_result
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Audit failed: {str(e)}"
        )


@router.get("/project/{job_id}")
async def get_project_details(job_id: str):
    """
    Get full project details by job_id.
    
    This would fetch from a database in production.
    For now, returns error - implement storage first.
    """
    raise HTTPException(
        status_code=501,
        detail="Project storage not implemented yet. Job data is not persisted."
    )


@router.post("/audit/quick")
async def quick_audit(file: UploadFile = File(...)):
    """
    Quick audit - auditor only (no full report).
    Faster but less detailed.
    """
    try:
        project_data = await process_zip_to_hierarchy(file, include_content=True)
        agent_service = AgentService()
        audit_result = await agent_service.run_audit_only(project_data)
        
        return {
            "job_id": project_data["job_id"],
            "project": {
                "name": project_data["filename"],
                "stats": project_data["stats"]
            },
            "audit": audit_result
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Quick audit failed: {str(e)}"
        )
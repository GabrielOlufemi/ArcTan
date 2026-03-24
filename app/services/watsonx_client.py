# app/services/watsonx_client.py

import httpx
import os
from typing import Dict, Any, Optional, List
from datetime import datetime


class WatsonxOrchestrate:
    """
    Client for IBM watsonx Orchestrate OpenAPI agents.
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        instance_url: Optional[str] = None,
        timeout: float = 300.0
    ):
        self.api_key = api_key or os.getenv("WATSONX_API_KEY")
        self.instance_url = instance_url or os.getenv("WATSONX_INSTANCE_URL")
        self.timeout = timeout
        
        if not self.api_key:
            raise ValueError("API key required. Set WATSONX_API_KEY env var")
        if not self.instance_url:
            raise ValueError("Instance URL required. Set WATSONX_INSTANCE_URL env var")
        
        self.instance_url = self.instance_url.rstrip('/')
        self._access_token = None
        self._token_expires_at = None
    
    async def _get_access_token(self) -> str:
        """Get IBM Cloud IAM access token with caching"""
        if self._access_token and self._token_expires_at:
            if datetime.now().timestamp() < self._token_expires_at - 300:
                return self._access_token
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://iam.cloud.ibm.com/identity/token",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json"
                },
                data={
                    "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                    "apikey": self.api_key
                }
            )
            response.raise_for_status()
            token_data = response.json()
            
            self._access_token = token_data["access_token"]
            self._token_expires_at = datetime.now().timestamp() + token_data["expires_in"]
            
            return self._access_token
    
    async def code_auditor_analyze(
        self,
        project_data: Dict[str, Any],
        options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send code to Code_Auditor agent for analysis via OpenAPI endpoint.
        
        Args:
            project_data: Project hierarchy with code content from /zip/hierarchy
            options: Analysis options
        
        Returns:
            Structured analysis results
        """
        token = await self._get_access_token()
        
        # Extract Python files with content
        python_files = self._extract_python_files(project_data.get("structure", {}))
        
        # Prepare OpenAPI request payload
        payload = {
            "project": {
                "name": project_data.get("filename", "unknown"),
                "root": project_data.get("root", ""),
                "stats": project_data.get("stats", {})
            },
            "files": python_files[:20],  # Limit to 20 files to avoid payload size issues
            "options": options or {
                "check_syntax": True,
                "check_logic": True,
                "analyze_complexity": True,
                "security_scan": False
            }
        }
        
        # Call Code_Auditor OpenAPI endpoint
        # Based on watsonx configuration, the operation is mapped directly under the instance URL
        endpoint = f"{self.instance_url}/analyze"
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    json=payload
                )
                response.raise_for_status()
                result = response.json()
                
                # Add metadata
                result["agent"] = "Code_Auditor"
                result["timestamp"] = datetime.utcnow().isoformat() + "Z"
                result["files_submitted"] = len(python_files)
                
                return result
                
            except httpx.HTTPStatusError as e:
                # Handle HTTP errors
                error_detail = e.response.text if e.response else str(e)
                return {
                    "status": "failed",
                    "agent": "Code_Auditor",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "error": f"HTTP {e.response.status_code}: {error_detail}",
                    "files_analyzed": 0
                }
            
            except Exception as e:
                # Handle other errors
                return {
                    "status": "failed",
                    "agent": "Code_Auditor",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "error": str(e),
                    "files_analyzed": 0
                }
    
    def _extract_python_files(self, structure: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Recursively extract Python files with content from project structure.
        """
        files = []
        
        if structure.get("type") == "file":
            if structure.get("category") == "source" and "content" in structure:
                files.append({
                    "path": structure.get("path"),
                    "name": structure.get("name"),
                    "content": structure.get("content"),
                    "lines": structure.get("lines", 0),
                    "size": structure.get("size", 0)
                })
        
        elif structure.get("type") == "dir":
            for child in structure.get("children", []):
                files.extend(self._extract_python_files(child))
        
        return files
    
    async def automated_tester_generate(
        self,
        project_data: Dict[str, Any],
        test_options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate tests using Automated_Tester agent (when you set it up).
        
        Args:
            project_data: Project hierarchy with code content
            test_options: Testing preferences
        
        Returns:
            Generated test cases
        """
        token = await self._get_access_token()
        
        python_files = self._extract_python_files(project_data.get("structure", {}))
        
        payload = {
            "project": {
                "name": project_data.get("filename"),
                "stats": project_data.get("stats")
            },
            "files": python_files[:10],
            "options": test_options or {
                "framework": "pytest",
                "coverage_target": 80,
                "include_edge_cases": True
            }
        }
        
        endpoint = f"{self.instance_url}/api/skills/Automated_Tester/generate"
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json=payload
                )
                response.raise_for_status()
                result = response.json()
                result["agent"] = "Automated_Tester"
                result["timestamp"] = datetime.utcnow().isoformat() + "Z"
                return result
                
            except Exception as e:
                return {
                    "status": "failed",
                    "agent": "Automated_Tester",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
    
    async def snippet_extractor_extract(
        self,
        bug_description: str,
        project_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """        
        Args:
            bug_description: Description of the bug
            project_data: Project hierarchy
        
        Returns:
            Extracted code snippets
        """
        token = await self._get_access_token()
        
        python_files = self._extract_python_files(project_data.get("structure", {}))
        
        payload = {
            "bug_description": bug_description,
            "project": {
                "name": project_data.get("filename"),
                "stats": project_data.get("stats")
            },
            "files": python_files
        }
        
        endpoint = f"{self.instance_url}/api/skills/Snippet_Extractor/extract"
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    json=payload
                )
                response.raise_for_status()
                result = response.json()
                result["agent"] = "Snippet_Extractor"
                result["timestamp"] = datetime.utcnow().isoformat() + "Z"
                return result
                
            except Exception as e:
                return {
                    "status": "failed",
                    "agent": "Snippet_Extractor",
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
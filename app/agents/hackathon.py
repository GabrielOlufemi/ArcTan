from ibm_watsonx_orchestrate.agent_builder.agents import Agent, AgentKind, AgentStyle
from ibm_watsonx_orchestrate.agent_builder.agents.types import DEFAULT_LLM
from ibm_watsonx_orchestrate.agent_builder.tools import tool
from ibm_watsonx_orchestrate.agent_builder.tools.types import JsonSchemaObject

@tool
def get_snippet_context(issue_list: JsonSchemaObject, project_json: dict) -> list:
    """
    Locates the exact line of an issue and grabs surrounding context.
    
    Args:
        issue_list (JsonSchemaObject): Errors found by the auditor (must include 'file' and 'line_hint').
        project_json (dict): The full hierarchy JSON from the web dev.
    """
    # Create a quick lookup for file contents based of hierarchy json response
    file_map = {}
    def flatten(node):
        if node.get('type') == 'file':
            file_map[node['path']] = node.get('content', "")
        for child in node.get('children', []):
            flatten(child)
    
    flatten(project_json['structure'])
    
    enriched = []
    for issue in issue_list:
        path = issue.get('file')
        hint = issue.get('line_hint', "")
        content = file_map.get(path, "")
        
        if content and hint:
            lines = content.splitlines()
            for i, line in enumerate(lines):
                if hint in line:
                    start, end = max(0, i-2), min(len(lines), i+3)
                    issue['snippet'] = "\n".join([f"{j+1}| {lines[j]}" for j in range(start, end)])
                    issue['line_no'] = i + 1
                    break
        enriched.append(issue)
    return enriched


AUDITOR_OUTPUT_SCHEMA = JsonSchemaObject(
    type="object",
    description="Audit result containing list of issues",
    required=["issues"],
    properties={
        "issues": JsonSchemaObject(
            type="array",
            description="List of issues found in the codebase",
            items=JsonSchemaObject(
                type="object",
                required=["file", "issue", "line_hint"],
                properties={
                    "file": JsonSchemaObject(type="string", description="Full path of the file"),
                    "issue": JsonSchemaObject(type="string", description="Description of the bug"),
                    "line_hint": JsonSchemaObject(type="string", description="Code snippet (min 15 chars) exactly as it appears in the file content"),
                },
            ),
        ),
    },
)

auditor_agent = Agent(
    name="Code_Auditor",
    kind=AgentKind.NATIVE,
    llm=DEFAULT_LLM,
    style=AgentStyle.DEFAULT,
    description="""code analyzer for python projects, it finds syntax and logic errors. Returns structured JSON only.""",
    instructions="""
    You are an expert debugger. You will receive a JSON representing a file hierarchy.
    1. Iterate through every file with a 'content' field.
    2. Identify syntax errors (broken code) and semantic errors (logic flaws).
    3. For every error, output one object with: 'file' (full path), 'issue' (description), 'line_hint' (code snippet at least 15 chars, exactly as in content).
    Return ONLY a valid JSON object with a single key "issues" whose value is an array of those objects. No conversational text, no markdown—just the object. Do not skip files. Be thorough.
    """,
    structured_output=AUDITOR_OUTPUT_SCHEMA,
)

extractor_agent = Agent(
    name="Snippet_Extractor",
    kind=AgentKind.NATIVE,
    llm=DEFAULT_LLM,
    description="Retrieves code snippets for identified bugs.",
    instructions="Use the 'get_snippet_context' tool to provide visual evidence for every issue found by the Auditor.",
    tools=[get_snippet_context]
)

testing_suite_manager = Agent(
    name="Automated_Tester",
    kind=AgentKind.NATIVE,
    llm=DEFAULT_LLM,
    style=AgentStyle.DEFAULT,
    description="Automates the testing phase by analyzing uploaded code folders.",
    instructions="""
    When a project JSON is uploaded:
    1. Call 'Code_Auditor' to identify all potential issues across all files. The response is an object with key "issues" (the array of findings).
    2. Pass that "issues" array and the original project JSON to 'Snippet_Extractor' to get the code context.
    3. Present a final report to the user. Format it as:
       ## Code Audit Report
       - **File**: [Path]
       - **Issue**: [Description]
       - **Code**:
       ```[language]
       [Snippet from Extractor]
       ```
       ## Recommendations## 
       - 1 or 2 concrete and actionable recommendations based on findings
    """,
    collaborators=[auditor_agent, extractor_agent]
)

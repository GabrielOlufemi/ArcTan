from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from app.api.zip import router as zip_router

# Load environment variables from .env file
load_dotenv()

app = FastAPI(
    title="ArcTan - Advanced Code Review As A Service",
    description="AI-powered code review using IBM watsonx Orchestrate",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",      
        "http://127.0.0.1:5500",      
        "http://localhost:3000",      
        "http://localhost:5173",      
        "http://localhost:8080",      
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],  
)

# random shit from online

# How It Works
# The process typically involves posting a code review request,
# selecting a qualified reviewer, and receiving detailed feedback. 
# Reviewers analyze the code line-by-line, checking for potential problems, 
# adherence to best practices, and opportunities for optimization.

# Services like Codementor provide access to a large pool of vetted developers across various technologies, 
# ensuring expertise tailored to your project's needs.

# Benefits
# Code review services save time by catching issues early,
# reducing technical debt, and improving overall code quality. 
# They also provide an opportunity for developers to learn and grow through constructive feedback.
# Additionally, services often include built-in tools for seamless communication and the option to sign NDAs for code security.

app.include_router(zip_router)


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "service": "ArcTan API",
        "description": "Advanced Code Review As A Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "hierarchy": "/zip/hierarchy",
            "audit": "/zip/audit",              # orchestrator kinni
            "quick_audit": "/zip/audit/quick"   # quick audit endpoint
        },
        "docs": "/docs"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint with configuration status"""
    return {
        "status": "healthy",
        "service": "ArcTan API",
        "watsonx_configured": bool(os.getenv("WATSONX_API_KEY")),
        "watsonx_instance": os.getenv("WATSONX_INSTANCE_URL", "not configured") # not configured if url doesn't existt
    }
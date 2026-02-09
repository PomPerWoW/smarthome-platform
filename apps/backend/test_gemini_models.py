import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def list_models():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not found.")
        return

    try:
        client = genai.Client(api_key=api_key)
        pager = client.models.list()
        for model in pager:
            print(f"Model Name: {model.name}")
            # print(f"Display Name: {model.display_name}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_models()

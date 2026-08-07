import asyncio
import os
from playwright.async_api import async_playwright

async def generate_pdf():
    current_dir = os.path.abspath(os.path.dirname(__file__))
    html_path = os.path.join(current_dir, "documentos", "manual_usuario.html")
    pdf_path = os.path.join(current_dir, "documentos", "Manual_de_Usuario_SPOERER_ERP.pdf")
    
    file_url = f"file:///{html_path.replace('\\', '/')}"
    print(f"Loading HTML from: {file_url}")
    
    async with async_playwright() as p:
        # Use installed MS Edge
        browser = await p.chromium.launch(
            executable_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            headless=True
        )
        page = await browser.new_page()
        
        # Load page and wait for network idle to ensure image assets load
        await page.goto(file_url, wait_until="networkidle")
        await page.emulate_media(media="print")
        
        # Print to PDF with background graphics enabled
        await page.pdf(
            path=pdf_path,
            format="A4",
            print_background=True,
            margin={"top": "0mm", "right": "0mm", "bottom": "0mm", "left": "0mm"},
            prefer_css_page_size=True
        )
        
        await browser.close()
        print(f"PDF successfully generated at: {pdf_path}")

if __name__ == "__main__":
    asyncio.run(generate_pdf())

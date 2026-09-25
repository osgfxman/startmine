import os
import pandas as pd

def codebase_to_excel(base_dir, output_excel):
    data = []
    
    ignore_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.exe', '.dll', '.zip', '.pdf']
    ignore_dirs = ['node_modules', '.git', '__pycache__', 'dist', 'build', '.angular']

    print("بدأنا نجمع الملفات... ثواني معايا.")

    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in ignore_extensions:
                continue
                
            file_path = os.path.join(root, file)
            relative_path = os.path.relpath(file_path, base_dir)
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                max_chars = 32000
                if len(content) > max_chars:
                    chunks = [content[i:i+max_chars] for i in range(0, len(content), max_chars)]
                    for idx, chunk in enumerate(chunks):
                        data.append({
                            'File Path': f"{relative_path} (Part {idx+1})",
                            'File Name': file,
                            'Extension': ext,
                            'Code Content': chunk
                        })
                else:
                    data.append({
                        'File Path': relative_path,
                        'File Name': file,
                        'Extension': ext,
                        'Code Content': content
                    })
            except Exception as e:
                print(f"⚠️ مقدرتش أقرأ الملف: {relative_path} - ممكن يكون مش Text File")

    df = pd.DataFrame(data)
    
    # استخدام xlsxwriter لقفل تحويل النصوص لمعادلات
    writer = pd.ExcelWriter(output_excel, engine='xlsxwriter', engine_kwargs={'options': {'strings_to_formulas': False}})
    df.to_excel(writer, index=False, sheet_name='Codebase')
    writer.close()
    
    print(f"✅ مبروك! الكود كله اتجمع في الإكسل من غير مشاكل المعادلات هنا:\n{output_excel}")

# المسارات الجديدة
folder_path = r"C:\Users\NTRA\Desktop\Startmine - 26 Apr"
output_path = r"C:\Users\NTRA\Desktop\Codebase_Repomix.xlsx"

codebase_to_excel(folder_path, output_path)
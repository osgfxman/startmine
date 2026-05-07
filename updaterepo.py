import os
import pandas as pd
import re

def sync_excel_to_codebase(excel_path, base_dir):
    print("🔄 جاري قراءة التعديلات من ملف الإكسل...")
    
    try:
        df = pd.read_excel(excel_path)
    except Exception as e:
        print(f"❌ مش قادر أفتح ملف الإكسل: {e}")
        return

    def extract_real_path(file_path_col):
        match = re.search(r"(.+?) \(Part (\d+)\)$", str(file_path_col))
        if match:
            return match.group(1), int(match.group(2))
        return str(file_path_col), 1

    temp_data = df['File Path'].apply(extract_real_path)
    df['Real Path'] = [x[0] for x in temp_data]
    df['Part Order'] = [x[1] for x in temp_data]

    df = df.sort_values(by=['Real Path', 'Part Order'])

    updated_files = df.groupby('Real Path')['Code Content'].apply(lambda x: ''.join(x.astype(str))).to_dict()

    print(f"📂 لقينا {len(updated_files)} ملف جاهز للتحديث.")

    for relative_path, new_content in updated_files.items():
        full_path = os.path.join(base_dir, relative_path)
        
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        try:
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"✅ تم تحديث الملف: {relative_path}")
        except Exception as e:
            print(f"❌ فشل تحديث الملف {relative_path}: {e}")

    print("\n✨ مبروك! كل التعديلات اللي في الإكسل اتنفذت على الـ Codebase.")

# المسارات الجديدة
excel_file = r"C:\Users\NTRA\Desktop\Codebase_Repomix.xlsx"
base_directory = r"C:\Users\NTRA\Desktop\Startmine - 26 Apr"

sync_excel_to_codebase(excel_file, base_directory)
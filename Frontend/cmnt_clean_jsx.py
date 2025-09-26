import os
import re

def rename_files_and_remove_comments():
    """
    Renames specified JSX files to .bak, removes all comments from them,
    and then deletes the .bak files.
    """
    # Define the list of files to process, relative to the script's location.
    file_list = [
        'src/App.jsx',
        'src/Auth.jsx',
        'src/Dashboards.jsx',
        'src/views/AdminDashboard.jsx',
        'src/views/SellerDashboard.jsx',
        'src/views/BuyerDashboard.jsx'
    ]

    # --- Step 1: Rename files to .bak ---
    for original_name in file_list:
        if os.path.exists(original_name):
            backup_name = original_name + '.bak'
            os.rename(original_name, backup_name)
            print(f"Renamed '{original_name}' to '{backup_name}'")
        else:
            print(f"File not found: '{original_name}'. Skipping rename.")

    # --- Step 2: Remove comments from .bak files ---
    for original_name in file_list:
        backup_name = original_name + '.bak'
        if os.path.exists(backup_name):
            try:
                with open(backup_name, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Regex to remove single-line comments (//) and multi-line comments (/*...*/)
                # and leading/trailing whitespace on lines that are only comments.
                # It also handles comments at the end of a line.
                cleaned_content = re.sub(r'//.*', '', content)
                cleaned_content = re.sub(r'/\*[\s\S]*?\*/', '', cleaned_content)

                # Write the cleaned content back to the original file name
                with open(original_name, 'w', encoding='utf-8') as f:
                    f.write(cleaned_content)
                
                print(f"Comments removed from '{backup_name}', saved to '{original_name}'")
            except Exception as e:
                print(f"An error occurred while processing '{backup_name}': {e}")
        else:
            print(f"Backup file not found: '{backup_name}'. Skipping comment removal.")

    # --- Step 3: Delete the .bak files ---
    for original_name in file_list:
        backup_name = original_name + '.bak'
        if os.path.exists(backup_name):
            os.remove(backup_name)
            print(f"Deleted backup file: '{backup_name}'")

if __name__ == "__main__":
    rename_files_and_remove_comments()

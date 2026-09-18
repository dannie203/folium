// scripts/test_drive_folder.mjs
// Test script to verify Google Drive folder creation for Folium

async function runTest() {
  const token = process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ Error: GOOGLE_ACCESS_TOKEN environment variable is required.');
    process.exit(1);
  }

  const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  console.log('🔍 Checking for existing /Folium folder on Google Drive...');
  const query = encodeURIComponent("name = 'Folium' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const searchResp = await fetch(`${DRIVE_API_BASE}/files?q=${query}&fields=files(id, name, createdTime)`, { headers });

  if (!searchResp.ok) {
    const errText = await searchResp.text();
    console.error(`❌ Search failed (${searchResp.status}):`, errText);
    process.exit(1);
  }

  const searchData = await searchResp.json();
  let folderId = null;

  if (searchData.files && searchData.files.length > 0) {
    folderId = searchData.files[0].id;
    console.log(`📁 Found existing /Folium folder! ID: ${folderId}`);
  } else {
    console.log('✨ /Folium folder not found. Creating new /Folium folder on Google Drive...');
    const createResp = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Folium',
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Folium E-Reader synced library folder',
      }),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      console.error(`❌ Folder creation failed (${createResp.status}):`, errText);
      process.exit(1);
    }

    const newFolder = await createResp.json();
    folderId = newFolder.id;
    console.log(`🎉 SUCCESS: Created /Folium folder! ID: ${folderId}`);
  }

  // Test creating a nested subfolder (Folder-as-a-Shelf)
  console.log('\n🔍 Testing nested subfolder creation (/Folium/Văn Học)...');
  const subQuery = encodeURIComponent(`'${folderId}' in parents and name = 'Văn Học' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const subSearchResp = await fetch(`${DRIVE_API_BASE}/files?q=${subQuery}&fields=files(id, name)`, { headers });
  const subSearchData = await subSearchResp.json();

  if (subSearchData.files && subSearchData.files.length > 0) {
    console.log(`📂 Found existing subfolder /Folium/Văn Học! ID: ${subSearchData.files[0].id}`);
  } else {
    const subCreateResp = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Văn Học',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folderId],
      }),
    });
    const subFolder = await subCreateResp.json();
    console.log(`🎉 SUCCESS: Created nested subfolder /Folium/Văn Học! ID: ${subFolder.id}`);
  }

  console.log('\n✅ All Folium Google Drive folder operations verified successfully!');
}

runTest().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});

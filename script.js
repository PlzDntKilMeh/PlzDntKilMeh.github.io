// === NEW: PUBG Translation dictionary ===
let damageTranslationDict = null;

async function fetchTranslations() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/pubg/api-assets/refs/heads/master/dictionaries/telemetry/damageCauserName.json');
        if (response.ok) {
            damageTranslationDict = await response.json();
            console.log('Damage translations loaded');
        }
    } catch (e) {
        console.warn('Failed to load translations from GitHub, falling back to raw IDs', e);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    // Load translations and JSON data
    fetchTranslations();
    fetch('combined_data.json')
        .then(response => response.json())
        .then(data => {
            createTabsAndTables(data);
            createSqlTab('Kills', 'kill_v2_events');
            createSqlTab('Groggy', 'groggy_events');
        })
        .catch(error => console.error('Error loading JSON:', error));
});

// === EXISTING FUNCTION (unchanged) ===
function createTabsAndTables(data) {
    const tabsContainer = document.getElementById('tabs-container');
    const contentContainer = document.getElementById('content-container');
    const infoContainer = document.getElementById('info-container');

    let firstTab = true;

    for (const key in data) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.innerText = key;
        tabsContainer.appendChild(tab);

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-wrapper';
        tableWrapper.style.display = firstTab ? 'block' : 'none';

        const table = document.createElement('table');
        table.id = key;
        table.classList.add('table-content');
        tableWrapper.appendChild(table);
        contentContainer.appendChild(tableWrapper);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'info-div';
        infoDiv.innerHTML = `Kills: ${data[key]["kills_count"]} ${data[key]["last_update"]}`;
        infoDiv.style.display = firstTab ? 'block' : 'none';
        infoContainer.appendChild(infoDiv);

        createTable(table, (data[key]["scoreboard"] || []).sort((a, b) => (b.break_taken || 0) - (a.break_taken || 0)));

        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.table-wrapper, .telemetry-wrapper').forEach(w => w.style.display = 'none');
            document.querySelectorAll('.info-div').forEach(i => i.style.display = 'none');

            tab.classList.add('active');
            tableWrapper.style.display = 'block';
            infoDiv.style.display = 'block';
        });

        if (firstTab) {
            tab.classList.add('active');
            firstTab = false;
        }
    }
}

// === NEW FUNCTION: SQL tab with SQLite + column filters ===
let dbInstance = null;

async function createSqlTab(tabLabel, tableName) {
    const tabsContainer = document.getElementById('tabs-container');
    const contentContainer = document.getElementById('content-container');
    const infoContainer = document.getElementById('info-container');

    const telemetryTab = document.createElement('div');
    telemetryTab.className = 'tab';
    telemetryTab.innerText = tabLabel;
    tabsContainer.appendChild(telemetryTab);

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'telemetry-wrapper';
    tableWrapper.style.display = 'none';
    contentContainer.appendChild(tableWrapper);

    const telemetryContent = document.createElement('div');
    telemetryContent.className = 'telemetry-content';
    tableWrapper.appendChild(telemetryContent);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'info-div';
    infoDiv.innerHTML = `${tabLabel} data (<span id="db-status-${tableName}"></span>)`;
    infoDiv.style.display = 'none';
    infoContainer.appendChild(infoDiv);

    telemetryTab.addEventListener('click', async () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.table-wrapper, .telemetry-wrapper').forEach(w => w.style.display = 'none');
        document.querySelectorAll('.info-div').forEach(i => i.style.display = 'none');

        telemetryTab.classList.add('active');
        tableWrapper.style.display = 'block';
        infoDiv.style.display = 'block';

        if (!dbInstance) {
            await loadSQLiteDatabase(infoDiv, tableName);
        }
        if (dbInstance) {
            renderSqlTable(telemetryContent, tableName);
        }
    });
}

async function loadSQLiteDatabase(infoDiv, tableName) {
    const statusSpan = infoDiv.querySelector('span[id^="db-status"]');
    const loadingText = statusSpan || infoDiv;
    loadingText.innerHTML = '<strong style="color:#ffaa00">Loading 33MB DB...</strong>';

    try {
        const config = {
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/${file}`
        };
        const SQL = await initSqlJs(config);

        const response = await fetch('./telemetry_index.sqlite3');
        if (!response.ok) throw new Error(`HTTP ${response.status} — file missing?`);

        const arrayBuffer = await response.arrayBuffer();
        dbInstance = new SQL.Database(new Uint8Array(arrayBuffer));

        loadingText.innerHTML = '<strong style="color:#00cc00">Loaded successfully ✓</strong>';
        console.log('33MB SQLite database loaded into memory');
    } catch (err) {
        console.error(err);
        loadingText.innerHTML = '<strong style="color:#ff4444">Failed to load DB</strong>';
        alert('Could not load telemetry_index.sqlite3\nMake sure the file is in the repo root and deployed to GitHub Pages.');
    }
}

function renderSqlTable(containerElement, tableName) {
    const PAGE_SIZE = 500;
    let currentFilters = {};
    let currentOffset = 0;
    let currentSort = 'event_time'; // Default sort
    let sortDirection = 'DESC';     // Default direction

    // === DEFAULT COLUMNS TO SHOW ===
    let defaultVisibleColumns;
    if (tableName === 'kill_v2_events') {
        defaultVisibleColumns = new Set(['youtube_url', 'event_time', 'has_youtube', 'killer_name', 'victim_name','finisher_name', 'killerDamageInfo_damageCauserName']);
    } 
	if(tableName === 'groggy_events'){
		defaultVisibleColumns = new Set(['youtube_url', 'event_time', 'has_youtube', 'attacker_name', 'victim_name', 'killerDamageInfo_damageCauserName']);
	}

    renderCurrentPage(containerElement, PAGE_SIZE, currentFilters, currentOffset, defaultVisibleColumns);

    async function renderCurrentPage(container, limit, filters, offset, visibleColumns) {
        // Capture focus state before re-rendering
        const focusedElement = document.activeElement;
        const focusedCol = focusedElement && focusedElement.classList.contains('column-filter') ? focusedElement.dataset.col : null;
        const cursorPos = focusedElement ? focusedElement.selectionStart : null;

        container.innerHTML = `<p style="padding:20px; color:#00cc00;">Loading data...</p>`;

        try {
            // Build WHERE clause
            let whereClauses = [];
            let params = [];
            Object.keys(filters).forEach(col => {
                if (filters[col]) {
                    whereClauses.push(`"${col}" LIKE ?`);
                    params.push(`%${filters[col]}%`);
                }
            });
            const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // Total matching rows
            const countResult = dbInstance.exec(`SELECT COUNT(*) FROM "${tableName}" ${whereSQL}`, params);
            const totalMatching = countResult[0].values[0][0];

            // Get all column names
            const colResult = dbInstance.exec(`PRAGMA table_info("${tableName}")`);
            const allColumns = colResult[0].values.map(row => row[1]);

            // Build ORDER BY clause
            const orderSQL = currentSort ? `ORDER BY "${currentSort}" ${sortDirection}` : '';

            // Get current page data
            const dataSQL = `SELECT * FROM "${tableName}" ${whereSQL} ${orderSQL} LIMIT ${limit} OFFSET ${offset}`;
            const result = dbInstance.exec(dataSQL, params);
            const rows = result && result[0] ? result[0].values : [];

            const hasPrevious = offset > 0;
            const hasMore = offset + rows.length < totalMatching;

            // ==================== COLUMN SELECTOR (CHECKBOXES) ====================
            let columnSelectorHTML = `
                <div style="background:#1f1f1f; padding:15px; border-radius:8px; margin-bottom:15px;">
                    <strong>Show Columns:</strong> 
                    <button class="show-all-btn" style="margin-left:10px; padding:4px 10px; font-size:0.85em;">Show All</button>
                    <button class="reset-cols-btn" style="margin-left:5px; padding:4px 10px; font-size:0.85em;">Reset to Default</button>
                    <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:12px;">
            `;

            allColumns.forEach(col => {
                const isVisible = visibleColumns.has(col);
                columnSelectorHTML += `
                    <label style="display:flex; align-items:center; gap:5px; white-space:nowrap; font-size:0.9em;">
                        <input type="checkbox" class="col-toggle" data-col="${col}" ${isVisible ? 'checked' : ''}>
                        ${col}
                    </label>
                `;
            });
            columnSelectorHTML += `</div></div>`;

            // ==================== SCROLLABLE TABLE ====================
            let tableHTML = `
                <div style="max-height: 60vh; overflow-y: auto; border: 1px solid #333; border-radius: 6px;">
                    <table class="sql-table" style="width:100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="position: sticky; top: 0; background: #1a1a1a; z-index: 10; min-width:50px;">#</th>`;

            allColumns.forEach(col => {
                const displayStyle = visibleColumns.has(col) ? '' : 'display:none;';
                const sortIcon = currentSort === col ? (sortDirection === 'ASC' ? ' ▴' : ' ▾') : '';
                tableHTML += `
                    <th class="sortable-header" data-col="${col}" 
                        style="position: sticky; top: 0; background: #1a1a1a; z-index: 10; cursor: pointer; user-select: none; ${displayStyle}">
                        ${col}${sortIcon}
                    </th>`;
            });
            tableHTML += `</tr><tr>`;

            // Filter row
            tableHTML += `<th style="position: sticky; top: 40px; background: #1a1a1a; z-index: 10;"></th>`;
            allColumns.forEach(col => {
                const displayStyle = visibleColumns.has(col) ? '' : 'display:none;';
                const val = filters[col] || '';
                tableHTML += `
                    <th style="position: sticky; top: 40px; background: #1a1a1a; z-index: 10; ${displayStyle}">
                        <input type="text" class="column-filter" placeholder="Filter ${col}" data-col="${col}" 
                               value="${val}" style="width:100%; padding:6px; font-size:0.9em; border-radius:4px;">
                    </th>`;
            });
            tableHTML += `</tr></thead><tbody>`;

            // Data rows
            rows.forEach((rowData, idx) => {
                tableHTML += `<tr><td>${offset + idx + 1}</td>`;
                rowData.forEach((value, colIndex) => {
                    const colName = allColumns[colIndex];
                    const displayStyle = visibleColumns.has(colName) ? '' : 'display:none;';
                    let display = (value === null || value === undefined) ? '' : String(value);

                    // Translate damage names if applicable
                    if (damageTranslationDict && 
                        (colName === 'damageCauserName' || 
                         colName === 'finishDamageInfo_damageCauserName' || 
                         colName === 'killerDamageInfo_damageCauserName')) {
                        display = damageTranslationDict[display] || display;
                    }

                    display = display.replace(
                        /(https?:\/\/[^\s<>"']+)/gi,
                        '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#00aaff; text-decoration:underline;">$1</a>'
                    );
                    tableHTML += `<td style="${displayStyle}">${display}</td>`;
                });
                tableHTML += '</tr>';
            });
            tableHTML += '</tbody></table></div>';

            // ==================== PAGINATION (OUTSIDE SCROLL) ====================
            let paginationHTML = `
                <div style="margin-top: 20px; padding: 16px; background: #1f1f1f; border-radius: 8px; 
                            display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;
                            position: sticky; bottom: 0; z-index: 100; border-top: 1px solid #444;">
                    <div style="color: #ddd;">
                        <strong>Matching rows:</strong> ${totalMatching.toLocaleString()} 
                        <span style="margin-left: 20px; color: #aaa;">
                            Showing ${offset + 1} – ${Math.min(offset + rows.length, totalMatching)}
                        </span>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        ${hasPrevious ? `<button id="prev-btn" class="pagination-btn">← Previous ${PAGE_SIZE}</button>` : ''}
                        ${hasMore ? `<button id="next-btn" class="pagination-btn">Next ${PAGE_SIZE} →</button>` : ''}
                    </div>
                </div>
            `;

            container.innerHTML = columnSelectorHTML + tableHTML + paginationHTML;

            // Restore focus
            if (focusedCol) {
                const input = container.querySelector(`.column-filter[data-col="${focusedCol}"]`);
                if (input) {
                    input.focus();
                    if (cursorPos !== null) input.setSelectionRange(cursorPos, cursorPos);
                }
            }

            // ==================== EVENT LISTENERS ====================

            // Show All / Reset buttons
            container.querySelector('.show-all-btn').addEventListener('click', () => {
                renderCurrentPage(container, limit, filters, offset, new Set(allColumns));
            });
            container.querySelector('.reset-cols-btn').addEventListener('click', () => {
                renderCurrentPage(container, limit, filters, offset, new Set(defaultVisibleColumns));
            });

            // Sortable headers
            container.querySelectorAll('.sortable-header').forEach(header => {
                header.addEventListener('click', () => {
                    const col = header.dataset.col;
                    if (currentSort === col) {
                        sortDirection = sortDirection === 'ASC' ? 'DESC' : 'ASC';
                    } else {
                        currentSort = col;
                        sortDirection = 'ASC';
                    }
                    currentOffset = 0; // Reset to page 1 on sort
                    renderCurrentPage(container, limit, filters, currentOffset, visibleColumns);
                });
            });

            // Column toggle checkboxes
            container.querySelectorAll('.col-toggle').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    const col = checkbox.dataset.col;
                    if (checkbox.checked) {
                        visibleColumns.add(col);
                    } else {
                        visibleColumns.delete(col);
                        delete filters[col];
                    }
                    renderCurrentPage(container, limit, filters, offset, visibleColumns);
                });
            });

            // Filter inputs
            container.querySelectorAll('.column-filter').forEach(input => {
                input.addEventListener('input', () => {
                    currentFilters[input.dataset.col] = input.value.trim();
                    currentOffset = 0;
                    renderCurrentPage(container, limit, currentFilters, currentOffset, visibleColumns);
                });
            });

            // Pagination
            const nextBtn = container.querySelector('#next-btn');
            if (nextBtn) nextBtn.addEventListener('click', () => {
                currentOffset += PAGE_SIZE;
                renderCurrentPage(container, limit, currentFilters, currentOffset, visibleColumns);
            });

            const prevBtn = container.querySelector('#prev-btn');
            if (prevBtn) prevBtn.addEventListener('click', () => {
                currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
                renderCurrentPage(container, limit, currentFilters, currentOffset, visibleColumns);
            });

        } catch (e) {
            console.error(e);
            container.innerHTML = `<p style="padding:20px; color:#ff4444;">Error: ${e.message}</p>`;
        }
    }
}

// Create a table from a JSON object
function createTable(table, data) {
    const thead = table.createTHead();
    const tbody = table.createTBody();
    const headers = Object.keys(data[0] || {});

    // Create table headers
    const row = thead.insertRow();

    // Add a header for the row number
    const thRowNum = document.createElement('th');
    thRowNum.innerText = '#'; // Header for row numbers
    row.appendChild(thRowNum);

    headers.forEach(header => {
        const th = document.createElement('th');
        // rename at creation time
        if (header === 'twitch') th.innerText = 'source';
        else if (header === 'youtube') th.innerText = 'clips';
        else th.innerText = header;
        row.appendChild(th);
    });

    // Create table rows
    data.forEach((item, index) => { // Use index to keep track of the row number
        const row = tbody.insertRow();

        // Highlight the row if StillPlaying is true
        if (item && item.StillPlaying === true) {
            row.classList.add('row-highlight');
        }

        // Insert row number as the first cell
        const cellRowNum = row.insertCell();
        cellRowNum.innerText = index + 1; // Display the row number (1-based index)

        headers.forEach(header => {
            const cell = row.insertCell();

            if (header === 'twitch') {
                // item[header] may contain twitch OR youtube links — show appropriate label
                const links = (item[header] || []).map(link => {
                    let displayText;
                    if (typeof link === 'string' && link.includes("twitch.tv")) {
                        displayText = "twitch";
                    } else if (typeof link === 'string' && link.includes("youtube.com")) {
                        displayText = "youtube";
                    } else {
                        displayText = link; 
                    }
                    return `<a href="${link}" target="_blank" rel="noopener noreferrer">${displayText}</a>`;
                }).join('<br>'); // Use <br> for line breaks

                cell.innerHTML = links; // clickable links

            } else if (header === 'youtube') {
                // Create clickable YouTube links (array of dicts)
                const youtubeLinks = (item[header] || []).map(dict => {
                    const entry = Object.entries(dict || {})[0] || [];
                    const filename = entry[0] || '';
                    const url = entry[1] || '';
                    return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${filename}</a>` : '';
                }).join('<br>');
                cell.innerHTML = youtubeLinks; // Use innerHTML to allow clickable links
            } else {
                cell.innerText = item[header] !== undefined ? item[header] : '';
            }
        });
    });
}
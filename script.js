document.addEventListener("DOMContentLoaded", function () {
    // Load the JSON data
    fetch('combined_data.json')
        .then(response => response.json())
        .then(data => {
            createTabsAndTables(data);
        })
        .catch(error => console.error('Error loading JSON:', error));
});

// Create tabs and corresponding tables
function createTabsAndTables(data) {
    const tabsContainer = document.getElementById('tabs-container');
    const contentContainer = document.getElementById('content-container');
    const infoContainer = document.getElementById('info-container'); // New container for kills and date

    let firstTab = true;
    
    for (const key in data) {
        // Create Tab
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.innerText = key;
        tabsContainer.appendChild(tab);
        
        // Create Table Wrapper with Scroll
        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-wrapper';
        tableWrapper.style.display = firstTab ? 'block' : 'none';

        // Create Table
        const table = document.createElement('table');
        table.id = key;
        table.classList.add('table-content');
        tableWrapper.appendChild(table);
        contentContainer.appendChild(tableWrapper);

        // Create elements to display kills and date
        const infoDiv = document.createElement('div');
        infoDiv.className = 'info-div';
        infoDiv.innerHTML = `
            <p>Kills: <span id="${key}-Kills">${data[key]["kills_count"]}  <span id="${key}-date">${data[key]["last_update"]}</span></p>
        `;
        infoDiv.style.display = firstTab ? 'block' : 'none';
        infoContainer.appendChild(infoDiv); // Append to the new container

        createTable(table, data[key]["scoreboard"].sort((a, b) => b.break_taken - a.break_taken));

        // Tab click event
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.table-wrapper').forEach(w => w.style.display = 'none');
            document.querySelectorAll('.info-div').forEach(i => i.style.display = 'none'); // Hide all info divs

            tab.classList.add('active');
            tableWrapper.style.display = 'block';
            infoDiv.style.display = 'block'; // Show corresponding info div
        });

        if (firstTab) {
            tab.classList.add('active');
            firstTab = false;
        }
    }
}

// Create a table from a JSON object
function createTable(table, data) {
    const thead = table.createTHead();
    const tbody = table.createTBody();
    const headers = Object.keys(data[0]);

    // Create table headers
    const row = thead.insertRow();
    
    // Add a header for the row number
    const thRowNum = document.createElement('th');
    thRowNum.innerText = '#'; // Header for row numbers
    row.appendChild(thRowNum);

    headers.forEach(header => {
        const th = document.createElement('th');
        th.innerText = header;
        row.appendChild(th);
    });

    // Create table rows
    data.forEach((item, index) => { // Use index to keep track of the row number
        const row = tbody.insertRow();

        // Highlight the row if StillPlaying is true
        if (item.StillPlaying === true) {
            row.classList.add('row-highlight');
        }

        // Insert row number as the first cell
        const cellRowNum = row.insertCell();
        cellRowNum.innerText = index + 1; // Display the row number (1-based index)

        headers.forEach(header => {
            const cell = row.insertCell();

            if (header === 'twitch') {
                // Split Twitch links and display only the part after the last /
                const links = item[header].map(link => {
                    const splitLink = link.split('/'); // Split the link by /
                    const displayText = splitLink[splitLink.length - 1]; // Get the last part (video ID with query params)
                    return `<a href="${link}" target="_blank">${displayText}</a>`; // Use full link for href
                }).join('<br>'); // Use <br> for line breaks
                cell.innerHTML = links; // Use innerHTML to allow clickable links

            } else if (header === 'youtube') {
                // Create clickable YouTube links
                const youtubeLinks = item[header].map(dict => {
                    const [filename, url] = Object.entries(dict)[0];
                    return `<a href="${url}" target="_blank">${filename}</a>`;
                }).join('<br>');
                cell.innerHTML = youtubeLinks; // Use innerHTML to allow clickable links
            } else {
                cell.innerText = item[header];
            }
        });
    });
}

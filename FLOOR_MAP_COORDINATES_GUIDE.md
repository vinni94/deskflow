# Floor Map Interactive Hover - Implementation Guide

## ✅ Implementation Complete!

The interactive hover system for the floor map has been successfully implemented. You can now add coordinates for each desk and have popups appear exactly over the desks on the floor map image.

## 🎯 What Was Added

### 1. **Desk Coordinates Configuration** (app.js line ~17-28)
```javascript
const DESK_COORDINATES = {
  // Standard desks - Add your actual coordinates here
  // Example: 'S01': { x: 10, y: 15, width: 8, height: 6 },
  
  // Flexi desks - Add your actual coordinates here  
  // Example: 'F01': { x: 10, y: 45, width: 8, height: 6 },
};
```

### 2. **Interactive Overlay System**
- Replaced the static floor map image with a wrapper containing:
  - The floor map image
  - An overlay layer with invisible hotspots
  - Clickable/hoverable areas positioned at exact coordinates

### 3. **Hover Tooltip Functionality**
- `showImageTooltip()` - Displays tooltips positioned exactly on the floor map
- `generateFloorMapHotspots()` - Creates interactive areas for each configured desk
- Smart positioning to avoid screen edges

### 4. **CSS Styling**
- `.floor-hotspot` - Transparent interactive areas
- Hover effect: blue highlight when mouse is over a desk
- Z-index management for proper layering

## 📐 How to Add Coordinates

### Step 1: Identify Your Desks
Look at your floor map image (Toren2.png) and identify the positions of each desk.

### Step 2: Measure Coordinates
Coordinates are in **percentages** (0-100) relative to the image size:
- `x`: Distance from left edge (%)
- `y`: Distance from top edge (%)
- `width`: Width of clickable area (%)
- `height`: Height of clickable area (%)

### Step 3: Add to DESK_COORDINATES Object
Edit `frontend/js/app.js` and find the `DESK_COORDINATES` object (around line 17).

**Example for Standard Desks:**
```javascript
const DESK_COORDINATES = {
  // Standard desks
  'S01': { x: 15, y: 20, width: 8, height: 6 },
  'S02': { x: 25, y: 20, width: 8, height: 6 },
  'S03': { x: 35, y: 20, width: 8, height: 6 },
  'S04': { x: 45, y: 20, width: 8, height: 6 },
  // ... add all your standard desks
  
  // Flexi desks
  'F01': { x: 15, y: 50, width: 8, height: 6 },
  'F02': { x: 25, y: 50, width: 8, height: 6 },
  // ... add all your flexi desks
};
```

### Step 4: Test
Refresh your application and hover over the floor map where you placed the coordinates. You should see:
- A blue highlight when hovering over a desk area
- A popup showing desk owner and availability information
- Click functionality to book the desk

## 🎨 Customization Tips

### Adjust Hover Highlight Color
Edit `frontend/index.html` (around line 241) to change the hover effect:
```css
.floor-hotspot:hover {
  background-color: rgba(59, 130, 246, 0.15); /* Change this */
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3); /* And this */
}
```

### Show Hotspots for All Desks (Debug Mode)
By default, hotspots only appear for bookable desks. To show all desks during setup:
1. Find `generateFloorMapHotspots()` function in app.js
2. Change `if (!isInteractive) return;` to `// if (!isInteractive) return;`

## 🔄 Rollback Instructions

If you need to revert these changes:

### Option 1: Git Restore
```bash
cd /home/u0181079/Downloads/deskflow-fullstack
git checkout frontend/js/app.js frontend/index.html
```

### Option 2: Use Backup
```bash
cd /home/u0181079/Downloads/deskflow-fullstack/frontend/js
cp app.js.backup-* app.js  # Find the backup with timestamp
```

## 📝 Files Modified

- ✏️ `frontend/js/app.js` (+138 lines)
  - Added DESK_COORDINATES configuration
  - Added generateFloorMapHotspots() function
  - Added showImageTooltip() function  
  - Added showImageTooltipHandler() wrapper
  - Modified floor map rendering with overlay

- ✏️ `frontend/index.html` (+16 lines)
  - Added CSS for .floor-hotspot
  - Added CSS for #floor-map-wrapper
  - Added CSS for #floor-map-overlay

## 🚀 Next Steps

1. **Add your desk coordinates** to the DESK_COORDINATES object
2. **Test the hover functionality** by running your app
3. **Adjust coordinates** as needed for precise positioning
4. **Customize styling** if desired

## 💡 Pro Tips

- Start with approximate coordinates and refine them iteratively
- Use browser DevTools to inspect element positions
- Keep width/height consistent for uniform desk sizes
- Test on different screen sizes to ensure responsiveness

---

**Safety Note:** A timestamped backup was created at:
`frontend/js/app.js.backup-YYYYMMDD-HHMMSS`

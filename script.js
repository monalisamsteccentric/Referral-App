const socket = io(); // This initializes the socket connection

let token = null;

const registerForm = document.getElementById("register");
const loginForm = document.getElementById("login");
const addItemForm = document.getElementById("addItemForm");
const logoutButton = document.getElementById("logout");
const registerUsernameInput = document.getElementById("registerUsername");
const registerPasswordInput = document.getElementById("registerPassword");
const referralCodeRegisterInput = document.getElementById("referralCodeRegister"); // New input field
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const itemInput = document.getElementById("itemInput");
const itemList = document.getElementById("itemList");
const registerFormContainer = document.getElementById("registerForm");
const loginFormContainer = document.getElementById("loginForm");
const mainApp = document.getElementById("mainApp");
const purchaseFormContainer = document.getElementById("buyForm");
const purchaseForm = document.getElementById("purchaseForm");
const referralCodeInput = document.getElementById("referralCode");
const amountInput = document.getElementById("amount");
const userReferralCode = document.getElementById("userReferralCode");
const welcomeMessage = document.getElementById("welcomeMessage");

// Hide forms initially
mainApp.style.display = "none";
purchaseFormContainer.style.display = "none";
userReferralCode.style.display = "none";

// Register form submit
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = registerUsernameInput.value;
  const password = registerPasswordInput.value;
  const referredBy = referralCodeRegisterInput.value.trim(); // Capture referral code if provided

  const response = await fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, referredBy }),
  });

  const result = await response.json();
  if (response.ok) {
    alert(`Registration successful. Your referral code is: ${result.referralCode}. Please log in.`);
    registerFormContainer.style.display = "none";
    loginFormContainer.style.display = "block";
  } else {
    alert(result.message || "Registration failed. Try again.");
  }
});

// Login form submit
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = usernameInput.value;
  const password = passwordInput.value;

  const response = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const result = await response.json();
  if (response.ok) {
    token = result.token;
    loginFormContainer.style.display = "none";
    mainApp.style.display = "block";
    purchaseFormContainer.style.display = "block"; // Show purchase form after login
    welcomeMessage.textContent = `Welcome, ${username}!`;
    userReferralCode.textContent = `Your Referral Code: ${result.referralCode}`;
    userReferralCode.style.display = "block";
  } else {
    alert("Invalid login");
  }
});


socket.on('update', (userData) => {
  const tableBody = document.getElementById('profitTable').getElementsByTagName('tbody')[0];
  const newRow = tableBody.insertRow(-1); // Insert a new row at the end of the table

  // Insert new cells (<td> elements) and add the text content
  const cell1 = newRow.insertCell(0);
  const cell2 = newRow.insertCell(1);
  const cell3 = newRow.insertCell(2);
  const cell4 = newRow.insertCell(3);

  cell1.textContent = userData.username; // User's name
  cell2.textContent = userData.legUsername ? userData.legUsername : 'N/A'; // Leg's username
  cell3.textContent = userData.purchaseAmount ? userData.purchaseAmount : 'N/A'; // Purchase amount made by leg
  cell4.textContent = userData.totalProfit; // Profit earned
});

// Logout button click
logoutButton.addEventListener("click", () => {
  token = null;
  mainApp.style.display = "none";
  loginFormContainer.style.display = "block";
  purchaseFormContainer.style.display = "none"; // Hide purchase form after logout
  userReferralCode.style.display = "none";
});

// Add item form submit


// Listen for "itemAdded" events
socket.on("itemAdded", (data) => {
  const li = document.createElement("li");
  li.textContent = `${data._id}: ${data.item}`;
  itemList.appendChild(li);
});

// Handle purchase form submission
purchaseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const amount = parseFloat(amountInput.value);

  const response = await fetch("/buy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount }),
  });

  if (response.ok) {
    amountInput.value = "";
    alert("Purchase successful!");
  } else {
    alert("Failed to make purchase. Please try again.");
  }
});

// Listen for "purchaseMade" events
socket.on("purchaseMade", (data) => {
  const purchaseInfo = document.createElement("p");
  purchaseInfo.textContent = `User: ${data.username}, Amount: $${data.amount}`;
  document.body.appendChild(purchaseInfo);
});

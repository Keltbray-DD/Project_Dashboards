
  
  async function getUserDetailsFill() {
    await getUserDetails();
    access_token = await getAccessToken("account:read data:read");
    userID = userDetails.sub;
    userEmail = userDetails.email;
    sessionStorage.setItem('userDetails',userDetails)
    sessionStorage.setItem('userID',userID)
    //console.log("userID",sessionStorage.getItem('userID'))
    await checkIsClient()
    setUserInfo(userDetails);
    if(window.location.pathname.includes("/Project_Dashboards/?code=") || window.location.pathname.includes("/index.html")){
      await loadProjects();
    }
    const profileMenu = document.getElementById('profileMenu');
    const dropdown = document.getElementById('dropdown');

    profileMenu.addEventListener('click', (e) => {
        dropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!profileMenu.contains(e.target)) {
        dropdown.classList.remove('active');
        }
    });
  }
  function logout() {
    localStorage.setItem("user_refresh_token", "blank");
    clearUrlParameters();
    signin();
  }

  async function setUserInfo(data) {
    const profilePic = document.getElementById("userPic");
    const profileName = document.getElementById("userName");
    const profileEmail = document.getElementById("userEmail");
    if (data.picture) {
      profilePic.src = data.picture;
    } else {
      console.error("Image URL is undefined");
    }
    profileName.textContent = data.name;
    profileEmail.textContent = data.email;
    userEmail = data.email;
  }

  function showCustomAlert() {
    document.getElementById('custom-alert').style.display = 'flex';
    document.getElementById('AAFLink').href = AAFLink;
  }

  async function getUserDetails() {
    const headers = {
      "Content-Type": "application/json",
      Authorization: userAccessToken, // Make sure this is securely handled
    };
    const requestOptions = {
      method: "GET",
      headers: headers,
    };
    const apiUrl = "https://api.userprofile.autodesk.com/userinfo";
    response = await fetch(apiUrl, requestOptions)
      .then((response) => response.json())
      .then((data) => {
        //console.log(data);
        userDetails = data;
        return data;
      })
      .catch((error) => console.error("Error fetching data:", error));
    return response;
  }

  function signin() {
    window.open(
      "https://developer.api.autodesk.com/authentication/v2/authorize?response_type=code&client_id=UMPIoFc8iQoJ2eKS6GsJbCGSmMb4s1PY&redirect_uri=" +
        toolURL +
        "&scope=data:read data:write data:create&prompt=login&state=12321321",
      "_self"
    );
  }
  async function checkLogin() {
    // Check if 'code' parameter exists in the URL
    var codeParam = getParameterByName("code");
    var loaclRefreshToken = localStorage.getItem('user_refresh_token')
    //console.log(loaclRefreshToken)
    if(loaclRefreshToken == 'blank'){
      if (codeParam !== null) {
        //console.log("Code parameter found: " + codeParam);
        // Call the function to handle authorization
        await getAuthorisation(codeParam);
      } else {
        signin();
      }
    }else{
      await refreshToken()
    }

  }
  // Function to parse URL parameters
  function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
      results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return "";
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  }
  
  // Function to clear URL parameters (after reload or after successful fetch)
  function clearUrlParameters() {
    // Replace the current URL without reloading the page, and remove query parameters
    const cleanUrl =
      window.location.protocol +
      "//" +
      window.location.host +
      window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, "", cleanUrl);
  }
  
  async function getAuthorisation(code) {
    const bodyData = {
      code: code,
      grant_type: "authorization_code",
      redirect_uri: toolURL,
    };
  
    let formBody = [];
    for (let property in bodyData) {
      let encodedKey = encodeURIComponent(property);
      let encodedValue = encodeURIComponent(bodyData[property]);
      formBody.push(encodedKey + "=" + encodedValue);
    }
    formBody = formBody.join("&");
  
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic VU1QSW9GYzhpUW9KMmVLUzZHc0piQ0dTbU1iNHMxUFk6M1ZQMUdyekxMdk9Vb0V6dQ==", // Make sure this is securely handled
    };
  
    const requestOptions = {
      method: "POST",
      headers: headers,
      body: formBody,
    };
  
    const apiUrl = "https://developer.api.autodesk.com/authentication/v2/token";
    //console.log(apiUrl, requestOptions)
    AccessToken_Local = await fetch(apiUrl, requestOptions)
      .then((response) => response.json())
      .then((data) => {
        if (data.error === "invalid_grant") {
          // If there's an error, reload the page
          clearUrlParameters();
          location.reload();
        } else {
          //console.log(data);
          
          userRefreshToken = data.refresh_token;
          //console.log("userAccessToken",userRefreshToken)
          localStorage.setItem('user_refresh_token', userRefreshToken);
          userAccessToken = data.access_token;
          //console.log("userAccessToken", userAccessToken);
          // Clear the URL parameters once the token is retrieved successfully
          getUserDetailsFill();
        }
        return data;
      })
      .catch((error) => console.error("Error fetching data:", error));
    return AccessToken_Local;
  }
  async function refreshToken() {
    var loaclRefreshToken = localStorage.getItem('user_refresh_token')
    const bodyData = {
      //code: code,
      grant_type: "refresh_token",
      //scope:'data:read data:write data:create',
      refresh_token:loaclRefreshToken,
      //client_id:'UMPIoFc8iQoJ2eKS6GsJbCGSmMb4s1PY',
      //client_secret:'3VP1GrzLLvOUoEzu',
      redirect_uri: toolURL,
    };
    const formBody = Object.keys(bodyData)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(bodyData[key])}`)
    .join("&");
    //const formBody = Object.keys(bodyData).map(key => `${key}=${bodyData[key]}`).join("&");
    //formBody = formBody.join("&");
  
    //formBody = `grant_type=refresh_token&scope=data%3Aread%20data%3Awrite%20data%3Acreate&refresh_token=${loaclRefreshToken}&redirect_uri=${toolURL}`
  
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic VU1QSW9GYzhpUW9KMmVLUzZHc0piQ0dTbU1iNHMxUFk6M1ZQMUdyekxMdk9Vb0V6dQ==", // Make sure this is securely handled
    };
  
    const requestOptions = {
      method: "POST",
      headers: headers,
      body: formBody,
    };
  
    const apiUrl = "https://developer.api.autodesk.com/authentication/v2/token";
    //console.log(apiUrl, requestOptions)
    AccessToken_Local = await fetch(apiUrl, requestOptions)
      .then((response) => response.json())
      .then((data) => {
        if (data.error === "invalid_grant") {
          // If there's an error, reload the page
          localStorage.setItem('user_refresh_token','blank');
          clearUrlParameters();
          location.reload();
        } else {
          //console.log(data);
          localStorage.setItem('user_refresh_token',data.refresh_token);
          userRefreshToken = data.refresh_token;
          //console.log("userRefreshToken", userRefreshToken);
          userAccessToken = data.access_token;
          //console.log("userAccessToken", userAccessToken);
          getUserDetailsFill();
        }
        return data;
      })
      .catch((error) => console.error("Error fetching data:", error));
    return AccessToken_Local;
  }

  async function checkIsClient() {
    if(userEmail.includes("aureos") || userEmail.includes("keltbray")){
      isClient = false
    }
  }
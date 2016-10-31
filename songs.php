<?php

require_once 'app/php/getid3/getid3.php';


$op = filter_input(INPUT_POST, 'op');
if ($op == "") {
	$op = filter_input(INPUT_GET, 'op');
}


switch ($op) {
	case 'rename':
		$old = filter_input(INPUT_POST, 'old');
		$new = filter_input(INPUT_POST, 'new');
		rename($old, $new);
		echo 'OK';
		break;

	case 'remove':
		$path = filter_input(INPUT_POST, 'path');

		$p = explode("/", $path);
		$p[0] ='trash';
		echo implode('/',  $p);
		rename($path, implode('/',  $p));
		// unlink($path);
		break;

	case 'upload':
		$uploaddir = $_POST['dir']. '/';
		mkdir($_POST['dir']);
		$uploadfile = $uploaddir . basename($_FILES['file']['name']);
		if (move_uploaded_file($_FILES['file']['tmp_name'], $uploadfile)) {
		    echo "File is valid, and was successfully uploaded.\n";
		} else {
		    echo "Possible file upload attack!\n";
		}
		// echo 'Here is some more debugging info:';
		// print_r($_FILES);
		break;

	case "info":
		$path = filter_input(INPUT_POST, 'path');
		$info = getInfo($path);
		echo json_encode($info);
		break;

    case 'findwmw':
		$files = glob("**/*.{wma,wmv}", GLOB_BRACE); 
		echo "<pre>";
		print_r($files);
		break;

    case 'renamefolder':

		$files = glob("torename/*.{mp3,m4a,ogg,MP3}", GLOB_BRACE); 

		foreach ($files as $f) {
			$info = getInfo($f);
			// print_r($info);

			if (!isset($info['artist'])) {
				echo 'TAG NOT FOUND!!!: '.$f.'<br />';
				print_r($info);		
			} else {
				$path = explode("/", $f);
				// echo count($path);

				$artist = $info['artist'];
				if (strpos($artist, ',') !== false) {
					$t = explode(',' ,$artist );
					$artist = trim($t[1]). ' '. trim($t[0]);
					if (isset($t[2])) {echo 'error'; die();}
				}
				$path[count($path)-1] =  $artist. " - " . $info['title'] . "." . pathinfo($f, PATHINFO_EXTENSION);;
				$new =  implode('/', str_replace('/', '-', $path));


				// $new = str_replace('Various - ', '', $new);
				// $new = str_replace('torename/', 'world/', $new);

				echo $f . ' => '. $new . ' <br />';
				// echo $f . ' => '. $path[count($path)-1] . ' <br />';

				rename($f, $new);
			}
		}
		echo 'DONE';
    	break;

	case 'postchat':
		$name = filter_input(INPUT_POST, 'name');
		$text = filter_input(INPUT_POST, 'text');
		$chat = json_decode(file_get_contents('chat.json'));
		array_unshift($chat->messages, array('name'=> $name,'text'=> $text,'time'=> time()));
		file_put_contents('chat.json', json_encode($chat));
		include "chat.json";
    	break;

	default:
		$files = glob("**/*.{mp3,m4a,ogg,MP3,M4A,OGG}", GLOB_BRACE); 
		usort($files, 'strnatcasecmp'); 
		$ret = array();
		foreach ($files as $f) {

			$p = explode("/", $f);
			if ($p[0] == "trash") continue;

			$item = array('mfilename' => $f, 'modified' => filemtime($f)/*, 'created' => filectime($f)*/);
			// $info = getInfo($path);
			$ret[] = $item;
		}

		echo safe_json_encode($ret);
		break;

}

function getInfo($file) {
	$item = array();
    set_error_handler("warning_handler2", E_WARNING);
    // Initialize getID3 engine
    $getID3 = new getID3; 
    // Analyze file and store returned data in $ThisFileInfo
    $info = $getID3->analyze($file); 
    restore_error_handler();


    if (isset($info['playtime_string'])) {
    	$item['playtime'] = $info['playtime_string'];
    }

	if (isset($info['audio'])) {
		$item['filesize'] = $info['filesize'];
		$item['bitrate'] = $info['audio']['bitrate'];
		$item['bitrate_mode'] = $info['audio']['bitrate_mode'];
		$item['sample_rate'] = $info['audio']['sample_rate'];
		$item['channels'] = $info['audio']['channels'];
	}

	if (isset($info['tags']['quicktime'])) {
		$item['title'] = implodeTag($info['tags']['quicktime']['title']);
		$item['artist'] = implodeTag($info['tags']['quicktime']['artist']);
		$item['composer'] = implodeTag($info['tags']['quicktime']['composer']);
		$item['album'] = implodeTag($info['tags']['quicktime']['album']);
	}

	if (isset($info['tags']['id3v1']) && isset($info['tags']['id3v1']['artist'])) {
		$item['title'] = implodeTag($info['tags']['id3v1']['title']);
		$item['artist'] = implodeTag($info['tags']['id3v1']['artist']);
		$item['composer'] = implodeTag($info['tags']['id3v1']['composer']);
		$item['album'] = implodeTag($info['tags']['id3v1']['album']);
	}

	// echo '<pre>Tags:';
 	// print_r($info);
	
	if (isset($info['tags']['id3v2']) && isset($info['tags']['id3v2']['artist'])) {
		$item['title'] = implodeTag($info['tags']['id3v2']['title']);
		$item['artist'] = implodeTag($info['tags']['id3v2']['artist']);
		$item['composer'] = implodeTag($info['tags']['id3v2']['composer']);
		$item['album'] = implodeTag($info['tags']['id3v2']['album']);
	}

	// if (function_exists('id3_get_tag')) {
	// 	try {
	// 		//$id3 = id3_get_tag($f);
	// 		$id3 = array();	
	// 	} catch (Exception $e) {
	// 	    echo 'Caught exception: ',  $e->getMessage(), $f, "\n";
	// 		$id3 = array();	
	// 	}
	// }

	return $item;
}
function implodeTag($tag) {
	if (is_array($tag)) {
		return implode(' ', $tag);
	}else {
		return $tag;
	}
}

function warning_handler2($errno, $errstr) { 
	echo "erroooooooor";
    // header($_SERVER['SERVER_PROTOCOL'] . ' 500 Internal Server Error', true, 500);
    // die();
}

function safe_json_encode($value){
	if (version_compare(PHP_VERSION, '5.4.0') >= 0) {
	    $encoded = json_encode($value, JSON_PRETTY_PRINT);
	} else {
	    $encoded = json_encode($value);
	}
	switch (json_last_error()) {
	    case JSON_ERROR_NONE:
	        return $encoded;
	    case JSON_ERROR_DEPTH:
	        return 'Maximum stack depth exceeded'; // or trigger_error() or throw new Exception()
	    case JSON_ERROR_STATE_MISMATCH:
	        return 'Underflow or the modes mismatch'; // or trigger_error() or throw new Exception()
	    case JSON_ERROR_CTRL_CHAR:
	        return 'Unexpected control character found';
	    case JSON_ERROR_SYNTAX:
	        return 'Syntax error, malformed JSON'; // or trigger_error() or throw new Exception()
	    case JSON_ERROR_UTF8:
	        $clean = utf8ize($value);
	        return safe_json_encode($clean);
	    default:
	        return 'Unknown error'; // or trigger_error() or throw new Exception()
	}
}


function utf8ize($mixed) {
	if (is_array($mixed)) {
	    foreach ($mixed as $key => $value) {
	        $mixed[$key] = utf8ize($value);
	    }
	} else if (is_string ($mixed)) {
	    return utf8_encode($mixed);
	}
	return $mixed;
}

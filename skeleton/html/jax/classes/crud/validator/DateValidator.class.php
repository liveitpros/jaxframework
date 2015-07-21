<?php
// Copyright (c) 2011-2012 Ronald B. Cemer
// All rights reserved.
// This software is released under the BSD license.
// Please see the accompanying LICENSE.txt for details.

// This file is part of the jaxframework project.

if (!class_exists('Validator', false)) include dirname(__FILE__).'/Validator.class.php';
class DateValidator extends Validator {
	protected $valueName;

	public function __construct($params = array()) {
		parent::__construct($params);

		$this->valueName = isset($params['valueName']) ? $params['valueName'] : '';
		if ($this->valueName == '') throw new Exception('Missing or empty valueName parameter');
	}

	public function validate($db, &$row) {
		$vn = $this->valueName;
		$val = property_exists($row, $vn) ? $row->$vn : '';

		if (($this->allowNULL) && ($val === null)) return '';

		$isValid = true;
		if (strlen($val) != 10) {
			$isValid = false;
		} else if ((!ctype_digit($val[0])) ||
				(!ctype_digit($val[1])) ||
				(!ctype_digit($val[2])) ||
				(!ctype_digit($val[3])) ||
				($val[4] != '-') ||
				(!ctype_digit($val[5])) ||
				(!ctype_digit($val[6])) ||
				($val[7] != '-') ||
				(!ctype_digit($val[8])) ||
				(!ctype_digit($val[9]))) {
			$isValid = false;
		} else {
			$pieces = explode('-', $val);
			if (count($pieces) != 3) {
				$isValid = false;
			} else if ((strlen($pieces[0])!=4)||(strlen($pieces[1])!=2)||(strlen($pieces[2])!=2)) {
				$isValid = false;
			} else {
				$y = (int)ltrim($pieces[0], '0');
				$m = (int)ltrim($pieces[1], '0');
				$d = (int)ltrim($pieces[2], '0');
				$isValid = checkdate($m, $d, $y);
			}
		}

		if (!$isValid) {
			if ($this->errorMsg != '') return $this->errorMsg;
			return 'Malformed or invalid Date. Must be in YYYY-MM-DD format.';
		}
		return '';
	}
}

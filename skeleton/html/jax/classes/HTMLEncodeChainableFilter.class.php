<?php
// Copyright (c) 2010-2012 Ronald B. Cemer
// All rights reserved.
// This software is released under the BSD license.
// Please see the accompanying LICENSE.txt for details.

if (!class_exists('ChainableFilter', false)) include dirname(__FILE__).'/ChainableFilter.class.php';

class HTMLEncodeChainableFilter extends ChainableFilter {
	public function filter($text, $filterSpec) {
		if (strcasecmp(trim($filterSpec), 'htmlencode') == 0) {
			return htmlspecialchars($text);
		}
		if ( ($this->nextFilter !== null) && ($this->nextFilter !== false) ) {
			return $this->nextFilter->filter($text, $filterSpec);
		}
		return $text;
	}
}
